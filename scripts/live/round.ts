import { erc20Abi, getAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import { buildValuationSnapshot, computeRebalance, deltaLimits, hashPolicy, hashValuationSnapshot, priceMap, type ExecutionPolicy, type Holding, type PortfolioIntent } from "@venue0/portfolio";
import { matchRound, type MatchInput, type MatchResult } from "@venue0/matcher";
import { compareWithReference } from "@venue0/reference-matcher";
import {
  approvalNonce,
  approvalTypedData,
  buildSettlementPlan,
  intentTypedData,
  preflightSettlement,
  venue0SettlementAbi,
  venue0SettlementBytecode,
  verifyIntentSignature,
  type SettlementPlan,
} from "@venue0/settlement";
import { verifySettlement } from "@venue0/verifier";
import { rawUnitsForValue } from "@venue0/assets";
import { BPS, E18, explorerTx, log, mulDivDown, parseDecimal, type AssetUid } from "@venue0/shared";
import { createContext, forkFund, forkFundEth, parseMode, writeArtifact, type LiveContext, type Wallet } from "./context.ts";
import { captureChainlinkPrices, resolveStockTokens, type ResolvedAsset } from "./resolve.ts";

type Shift = { from: string; to: string; fractionBps: number };

type Scenario = {
  gate: string;
  /** Adds the Dynamic MPC agent wallet as participant "D". */
  dynamicAgent?: boolean;
  /** Per-wallet execution policy overrides (for example, price protection that forbids market residuals). */
  policies?: Record<string, Partial<ExecutionPolicy>>;
  dir: string;
  description: string;
  symbols: string[];
  /** Wallet label -> symbol the wallet starts with (fork funding) */
  holdings: Record<string, string>;
  shifts: Record<string, Shift>;
  expect: (match: MatchResult) => string[];
};

const shape = (condition: boolean, message: string) => (condition ? [] : [message]);

const SCENARIOS: Record<string, Scenario> = {
  L1: {
    gate: "G1",
    dir: "L1-bilateral",
    description: "A moves half its NVDA into AAPL; B moves half its AAPL into NVDA. Bilateral atomic exchange.",
    symbols: ["NVDA", "AAPL"],
    holdings: { A: "NVDA", B: "AAPL" },
    shifts: { A: { from: "NVDA", to: "AAPL", fractionBps: 5_000 }, B: { from: "AAPL", to: "NVDA", fractionBps: 5_000 } },
    expect: (m) => [...shape(m.legs.length === 2, `expected 2 legs, got ${m.legs.length}`), ...shape(m.totals.crossedNotionalUsdE18 > 0n, "nothing crossed")],
  },
  L2: {
    gate: "G2",
    dir: "L2-cycle",
    description: "A: NVDA->AAPL, B: AAPL->SPY, C: SPY->NVDA. No bilateral pair exists; only a 3-wallet cycle crosses.",
    symbols: ["NVDA", "AAPL", "SPY"],
    holdings: { A: "NVDA", B: "AAPL", C: "SPY" },
    shifts: {
      A: { from: "NVDA", to: "AAPL", fractionBps: 5_000 },
      B: { from: "AAPL", to: "SPY", fractionBps: 5_000 },
      C: { from: "SPY", to: "NVDA", fractionBps: 5_000 },
    },
    expect: (m) => [
      ...shape(m.legs.length === 3, `expected 3 legs, got ${m.legs.length}`),
      ...shape(m.cycles.length >= 1 && m.cycles.every((c) => c.length === 3), `expected only 3-hop cycles, got ${m.cycles.map((c) => c.length).join(",")}`),
      ...shape(m.totals.crossingParticipantCount === 3, `expected 3 crossing participants, got ${m.totals.crossingParticipantCount}`),
      ...shape(!m.legs.some((x) => m.legs.some((y) => x.from === y.to && x.to === y.from)), "a bilateral pair exists; cycle would be trivial"),
    ],
  },
  L3: {
    gate: "G3",
    dir: "L3-partial",
    description: "A moves all NVDA into AAPL; B moves only 30% of its AAPL into NVDA. Partial cross with exact residual.",
    symbols: ["NVDA", "AAPL"],
    holdings: { A: "NVDA", B: "AAPL" },
    shifts: { A: { from: "NVDA", to: "AAPL", fractionBps: 10_000 }, B: { from: "AAPL", to: "NVDA", fractionBps: 3_000 } },
    expect: (m) => [
      ...shape(m.status === "PARTIAL_CROSS", `expected PARTIAL_CROSS, got ${m.status}`),
      ...shape(m.totals.residualNotionalUsdE18 > 0n, "no residual"),
      ...shape(m.fills.every((f) => f.crossedRaw + f.residualRaw === f.requestedRaw), "crossed + residual != requested"),
    ],
  },
  L7: {
    gate: "DYNAMIC",
    dir: "L7-dynamic-agent",
    dynamicAgent: true,
    description: "Wallet A (EOA) moves half its AAPL into SPY; portfolio agent D (Dynamic MPC server wallet) moves half its SPY into AAPL. D signs its intent, plan approval and allowance tx through Dynamic.",
    symbols: ["AAPL", "SPY"],
    holdings: { A: "AAPL", D: "SPY" },
    shifts: { A: { from: "AAPL", to: "SPY", fractionBps: 5_000 }, D: { from: "SPY", to: "AAPL", fractionBps: 5_000 } },
    expect: (m) => [...shape(m.legs.length === 2, `expected 2 legs, got ${m.legs.length}`), ...shape(m.totals.crossedNotionalUsdE18 > 0n, "nothing crossed")],
  },
  L6: {
    gate: "L6",
    dir: "L6-flash-round",
    description: "C moves all NVDA into AAPL under a price-protection policy (no market residuals, LOW urgency); B moves all its AAPL into NVDA. The partial cross leaves C an NVDA residual for the residual engine.",
    symbols: ["NVDA", "AAPL"],
    holdings: { B: "AAPL", C: "NVDA" },
    shifts: { B: { from: "AAPL", to: "NVDA", fractionBps: 10_000 }, C: { from: "NVDA", to: "AAPL", fractionBps: 10_000 } },
    policies: { C: { allowMarketResidual: false, urgency: "LOW" } },
    expect: (m) => [...shape(m.status === "PARTIAL_CROSS", `expected PARTIAL_CROSS, got ${m.status}`), ...shape(m.totals.externalResidualCount > 0, "no external residual")],
  },
  L4: {
    gate: "G4",
    dir: "L4-no-cross",
    description: "A moves half its NVDA into AAPL; B moves half its SPY into AAPL. Both want AAPL, nobody offers it.",
    symbols: ["NVDA", "AAPL", "SPY"],
    holdings: { A: "NVDA", B: "SPY" },
    shifts: { A: { from: "NVDA", to: "AAPL", fractionBps: 5_000 }, B: { from: "SPY", to: "AAPL", fractionBps: 5_000 } },
    expect: (m) => [
      ...shape(m.status === "NO_CROSS", `expected NO_CROSS, got ${m.status}`),
      ...shape(m.totals.crossedNotionalUsdE18 === 0n, "crossed notional must be 0"),
      ...shape(m.totals.residualNotionalUsdE18 === m.totals.requestedNotionalUsdE18, "residual must equal requested"),
    ],
  },
};

const PROOF_POLICY = (validUntil: number): ExecutionPolicy => ({
  maxExternalSlippageBps: 50,
  maxReferencePriceDriftBps: 100,
  maxRoundDurationSec: 900,
  allowPartialCross: true,
  allowMarketResidual: true,
  allowLimitResidual: true,
  allowTwapResidual: true,
  allowWaitResidual: true,
  urgency: "NORMAL",
  validUntil,
});

async function deploySettlement(ctx: LiveContext): Promise<{ address: Address; deployTx?: Hex }> {
  const existing = ctx.mode === "live" ? process.env.CROSSING_SETTLEMENT_ADDRESS || undefined : undefined;
  if (existing) return { address: getAddress(existing) };
  const hash = await ctx.deployer.client.deployContract({ abi: venue0SettlementAbi, bytecode: venue0SettlementBytecode, account: ctx.deployer.client.account ?? ctx.deployer.address, chain: ctx.chain });
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("settlement deployment failed");
  log("round.deployed", { address: receipt.contractAddress, hash });
  return { address: getAddress(receipt.contractAddress), deployTx: hash };
}

function shiftTargets(holdings: Holding[], shift: Shift, prices: Map<AssetUid, bigint>, assets: ResolvedAsset[]) {
  const uidOf = (symbol: string) => (assets.find((a) => a.token.symbol === symbol) as ResolvedAsset).token.uid;
  const value = (uid: AssetUid) => {
    const h = holdings.find((x) => x.assetUid === uid);
    return h ? (h.rawBalance * (prices.get(uid) as bigint)) / E18 : 0n;
  };
  const moved = mulDivDown(value(uidOf(shift.from)), BigInt(shift.fractionBps), BPS);
  return assets.map((a) => {
    const uid = a.token.uid;
    let target = value(uid);
    if (uid === uidOf(shift.from)) target -= moved;
    if (uid === uidOf(shift.to)) target += moved;
    return { assetUid: uid, targetValueUsdE18: target };
  });
}

async function run(ctx: LiveContext, scenario: Scenario, fundUsd: bigint) {
  const dir = ctx.evidenceDir(scenario.dir);
  const labels = Object.keys(scenario.shifts);
  const participants = labels.map((l) => ctx.wallets.find((w) => w.label === l) as Wallet);
  const resolution = await resolveStockTokens(ctx.publicClient, scenario.symbols);
  const assets = resolution.assets;
  const symbolAsset = (s: string) => assets.find((a) => a.token.symbol === s) as ResolvedAsset;

  const settlement = await deploySettlement(ctx);
  const head = await ctx.publicClient.getBlock();
  let nowSec = Number(head.timestamp);

  const prices = await captureChainlinkPrices(ctx.publicClient, assets, nowSec);
  const snapshot = buildValuationSnapshot(prices.map((p) => p.chainlink), nowSec, 900);
  const snapshotHash = hashValuationSnapshot(snapshot);
  const priceByUid = priceMap(snapshot);

  if (ctx.mode === "fork") {
    for (const wallet of participants) {
      const asset = symbolAsset(scenario.holdings[wallet.label] as string);
      await forkFundEth(ctx, wallet.address);
      await forkFund(ctx, asset.token.contractAddress, wallet.address, rawUnitsForValue(fundUsd * E18, priceByUid.get(asset.token.uid) as bigint));
    }
  }

  const holdingsOf = async (wallet: Wallet): Promise<Holding[]> =>
    Promise.all(
      assets.map(async (a) => ({
        owner: wallet.address,
        assetUid: a.token.uid,
        token: a.token.contractAddress,
        rawBalance: await ctx.publicClient.readContract({ address: a.token.contractAddress, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] }),
      })),
    );

  const roundId = keccak256(stringToHex(`venue0:${scenario.dir}:${ctx.environment}:${nowSec}`));
  const circleId = keccak256(stringToHex("venue0:live-proof-circle"));
  const tokens = new Map(assets.map((a) => [a.token.uid, a.token.contractAddress]));
  const intents: PortfolioIntent[] = [];
  const intentSignatures: Record<string, Hex> = {};
  const rebalances = [];
  for (const wallet of participants) {
    const holdings = await holdingsOf(wallet);
    const shift = scenario.shifts[wallet.label] as Shift;
    const rebalance = computeRebalance(holdings, { account: wallet.address, targets: shiftTargets(holdings, shift, priceByUid, assets) }, priceByUid, tokens);
    rebalances.push({ wallet: wallet.label, address: wallet.address, shift, rebalance });
    const policy = { ...PROOF_POLICY(nowSec + 900), ...(scenario.policies?.[wallet.label] ?? {}) };
    const intent: PortfolioIntent = {
      owner: wallet.address,
      agent: wallet.address,
      circleId,
      roundId,
      valuationSnapshotHash: snapshotHash,
      policyHash: hashPolicy(policy),
      policy,
      assets: deltaLimits(rebalance, priceByUid, 10n ** 16n),
      nonce: BigInt(nowSec),
      validAfter: nowSec - 60,
      validUntil: nowSec + 900,
    };
    const signature = await wallet.client.signTypedData({ ...intentTypedData(intent, settlement.address), account: wallet.client.account ?? wallet.address });
    await verifyIntentSignature(intent, signature, settlement.address);
    intents.push(intent);
    intentSignatures[wallet.address] = signature;
  }

  const matchInput: MatchInput = { roundId, snapshot, intents, universe: tokens, nowSec };
  const match = matchRound(matchInput);
  const reference = compareWithReference(match, matchInput);
  const shapeProblems = scenario.expect(match);
  const marketOnly = { externalOrders: intents.reduce((n, i) => n + i.assets.length, 0), externalNotionalUsdE18: match.totals.requestedNotionalUsdE18 };
  const venue0 = {
    externalOrders: match.totals.externalResidualCount,
    externalNotionalUsdE18: match.totals.residualNotionalUsdE18 - match.totals.dustResidualNotionalUsdE18,
    dustResidualNotionalUsdE18: match.totals.dustResidualNotionalUsdE18,
  };

  await writeArtifact(dir, "asset-resolution.json", resolution);
  await writeArtifact(dir, "price-evidence.json", prices);
  await writeArtifact(dir, "valuation-snapshot.json", { snapshotHash, snapshot });
  await writeArtifact(dir, "portfolios.json", rebalances);
  await writeArtifact(dir, "intents.json", { intents, signatures: intentSignatures, typedDataDomain: { name: "VENUE0", version: "1", chainId: 4663, verifyingContract: settlement.address } });
  await writeArtifact(dir, "matcher-output.json", match);
  await writeArtifact(dir, "reference-output.json", reference);

  const summaryBase = {
    gate: scenario.gate,
    scenario: scenario.dir,
    description: scenario.description,
    environment: ctx.environment,
    timestamp: new Date().toISOString(),
    settlementContract: settlement.address,
    settlementDeployTx: settlement.deployTx ?? null,
    roundId,
    status: match.status,
    totals: match.totals,
    cycles: match.cycles,
    marketOnly,
    venue0,
    referenceOk: reference.ok,
    shapeProblems,
  };

  if (!reference.ok || shapeProblems.length > 0) {
    await writeArtifact(dir, "summary.json", { ...summaryBase, result: "FAIL", reason: "matcher shape or reference parity failed before settlement" });
    log("round.failed", { dir, shapeProblems, reference: reference.ok });
    process.exitCode = 1;
    return;
  }

  if (match.status === "NO_CROSS") {
    await writeArtifact(dir, "summary.json", { ...summaryBase, result: "PASS", settlementTx: null, note: "No transaction: nothing crossed. Full request is residual." });
    log("round.done", { result: "PASS", status: match.status, dir });
    return;
  }

  nowSec = Number((await ctx.publicClient.getBlock()).timestamp);
  const plan: SettlementPlan = buildSettlementPlan(match, { settlementContract: settlement.address, validAfter: nowSec - 60, validUntil: nowSec + 900, generatedAt: nowSec });
  const nonces = new Map<Address, bigint>();
  const approvals: Array<{ nonce: bigint; signature: Hex }> = [];
  const approvalRecords: Record<string, { nonce: bigint; signature: Hex }> = {};
  for (const participant of plan.contractPlan.participants) {
    const wallet = participants.find((w) => w.address === participant) as Wallet;
    const nonce = approvalNonce(plan.planHash, participant);
    const signature = await wallet.client.signTypedData({ ...approvalTypedData(plan, participant, nonce), account: wallet.client.account ?? participant });
    nonces.set(participant, nonce);
    approvals.push({ nonce, signature });
    approvalRecords[participant] = { nonce, signature };
  }

  const allowanceTxs: Hex[] = [];
  for (const leg of plan.contractPlan.legs) {
    const wallet = participants.find((w) => w.address === leg.from) as Wallet;
    const hash = await wallet.client.writeContract({ address: leg.token, abi: erc20Abi, functionName: "approve", args: [settlement.address, leg.amount], account: wallet.client.account ?? leg.from, chain: ctx.chain });
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`approve ${leg.token} by ${leg.from} reverted`);
    allowanceTxs.push(hash);
  }

  const preflight = await preflightSettlement(ctx.publicClient, plan, nonces, Number((await ctx.publicClient.getBlock()).timestamp));
  await writeArtifact(dir, "settlement-plan.json", { plan, approvals: approvalRecords, allowanceTxs, preflight });
  if (!preflight.ok) {
    await writeArtifact(dir, "summary.json", { ...summaryBase, result: "FAIL", reason: "preflight failed", preflight });
    log("round.failed", { dir, preflight: preflight.issues });
    process.exitCode = 1;
    return;
  }

  const submitter = ctx.deployer;
  const hash = await submitter.client.writeContract({ address: settlement.address, abi: venue0SettlementAbi, functionName: "settle", args: [plan.contractPlan, approvals], account: submitter.client.account ?? submitter.address, chain: ctx.chain });
  log("round.submitted", { hash });
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  await writeArtifact(dir, "receipt.json", receipt);

  const verification = await verifySettlement(ctx.verifierClient, {
    txHash: hash,
    settlementContract: settlement.address,
    plan: plan.contractPlan,
    nonces,
    watchTokens: assets.map((a) => a.token.contractAddress),
  });
  await writeArtifact(dir, "verifier-report.json", verification);

  const result = receipt.status === "success" && verification.status === "PASS" ? "PASS" : verification.status === "INCONCLUSIVE" ? "INCONCLUSIVE" : "FAIL";
  await writeArtifact(dir, "summary.json", {
    ...summaryBase,
    result,
    planHash: plan.planHash,
    settlementTx: hash,
    settlementBlock: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    explorer: ctx.mode === "live" ? explorerTx(hash) : null,
    verifierStatus: verification.status,
    residuals: plan.residuals,
  });
  log("round.done", { result, status: match.status, dir });
  if (result !== "PASS") process.exitCode = 1;
}

const mode = parseMode(process.argv);
const [scenarioKey = "L2", fundUsd = "25"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const scenario = SCENARIOS[scenarioKey];
if (!scenario) throw new Error(`unknown scenario ${scenarioKey}; use one of ${Object.keys(SCENARIOS).join(", ")}`);
const ctx = await createContext(mode, 3, { dynamicAgent: scenario.dynamicAgent ?? false });
try {
  await run(ctx, scenario, parseDecimal(fundUsd, 0));
} finally {
  ctx.close();
}
