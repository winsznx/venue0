import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  hashTypedData,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { startAnvil, type Anvil } from "../../../scripts/lib/anvil.ts";
import {
  approvalTypedData,
  buildSettlementPlan,
  expectedNetDeltas,
  hashContractPlan,
  preflightSettlement,
  venue0SettlementAbi,
  venue0SettlementBytecode,
  type SettlementPlan,
} from "@venue0/settlement";
import { verifySettlement } from "../src/index.ts";
import { matchRound } from "@venue0/matcher";
import { ASSETS, NOW, ROUND_ID, buy, intent, sell, snapshot, t } from "../../matcher/test/helpers.ts";

const mock = JSON.parse(readFileSync("contracts/out/Venue0Settlement.t.sol/MockStockToken.json", "utf8")) as { abi: readonly unknown[]; bytecode: { object: Hex } };

// Anvil's well-known development keys. Local devnet only.
const KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
];

describe("settlement on a local devnet: EIP-712 parity, execution and independent verification", () => {
  let anvil: Anvil;
  let publicClient: PublicClient;
  let wallets: WalletClient[];
  let settlement: Address;
  const tokens = new Map<string, Address>();

  beforeAll(async () => {
    anvil = await startAnvil();
    publicClient = createPublicClient({ chain: foundry, transport: http(anvil.rpcUrl) });
    wallets = KEYS.map((k) => createWalletClient({ account: privateKeyToAccount(k), chain: foundry, transport: http(anvil.rpcUrl) }));
    const deployer = wallets[0] as WalletClient;
    const deploy = async (abi: readonly unknown[], bytecode: Hex, args: unknown[] = []) => {
      const hash = await deployer.deployContract({ abi, bytecode, args, account: deployer.account ?? null, chain: foundry });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return getAddress(receipt.contractAddress as Address);
    };
    settlement = await deploy(venue0SettlementAbi, venue0SettlementBytecode);
    for (const symbol of ["NVDA", "AAPL", "SPY"]) tokens.set(symbol, await deploy(mock.abi, mock.bytecode.object, [symbol]));
  }, 90_000);

  afterAll(() => anvil?.stop());

  function heroPlan(chainNow: number): { plan: SettlementPlan; owners: Address[] } {
    const owners = wallets.map((w) => w.account?.address as Address);
    const snap = snapshot();
    const remap = (limit: ReturnType<typeof sell>, symbol: string) => ({ ...limit, token: tokens.get(symbol) as Address });
    const universe = new Map(Object.values(ASSETS).map((a) => [a.uid, tokens.get(a.symbol) ?? a.token]));
    const intents = [
      intent(owners[0] as Address, [remap(sell("NVDA", t(15) / 2n), "NVDA"), remap(buy("AAPL", t(5)), "AAPL")], snap),
      intent(owners[1] as Address, [remap(sell("AAPL", t(5)), "AAPL"), remap(buy("SPY", t(2)), "SPY")], snap),
      intent(owners[2] as Address, [remap(sell("SPY", t(2)), "SPY"), remap(buy("NVDA", t(15) / 2n), "NVDA")], snap),
    ];
    const match = matchRound({ roundId: ROUND_ID, snapshot: snap, intents, universe, nowSec: NOW });
    expect(match.status).toBe("CROSSED");
    const plan = buildSettlementPlan(match, { settlementContract: settlement, validAfter: chainNow - 60, validUntil: chainNow + 3600, generatedAt: chainNow });
    return { plan, owners };
  }

  it("hashes plans and approval digests identically to Solidity, then settles the signed cycle", async () => {
    const block = await publicClient.getBlock();
    const { plan, owners } = heroPlan(Number(block.timestamp));
    const chainId = await publicClient.getChainId();

    const onchainPlanHash = await publicClient.readContract({ address: settlement, abi: venue0SettlementAbi, functionName: "hashPlan", args: [plan.contractPlan] });
    expect(onchainPlanHash).toBe(hashContractPlan(plan.contractPlan));

    const nonces = new Map<Address, bigint>();
    const approvals: Array<{ nonce: bigint; signature: Hex }> = [];
    for (const [i, participant] of plan.contractPlan.participants.entries()) {
      const nonce = 1000n + BigInt(i);
      nonces.set(participant, nonce);
      const typed = approvalTypedData(plan, participant, nonce, chainId);
      const onchainDigest = await publicClient.readContract({ address: settlement, abi: venue0SettlementAbi, functionName: "approvalDigest", args: [plan.contractPlan, participant, nonce] });
      expect(onchainDigest).toBe(hashTypedData(typed));
      const wallet = wallets[owners.indexOf(participant)] as WalletClient;
      approvals.push({ nonce, signature: await wallet.signTypedData({ ...typed, account: wallet.account ?? participant }) });
    }

    const funding = { NVDA: owners[0], AAPL: owners[1], SPY: owners[2] } as Record<string, Address>;
    for (const [symbol, owner] of Object.entries(funding)) {
      const token = tokens.get(symbol) as Address;
      const wallet = wallets[owners.indexOf(owner)] as WalletClient;
      const need = plan.contractPlan.legs.filter((l) => l.token === token).reduce((s, l) => s + l.amount, 0n);
      await publicClient.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: token, abi: mock.abi, functionName: "mint", args: [owner, need], account: wallet.account ?? owner, chain: foundry }) });
    }

    const beforeApprove = await preflightSettlement(publicClient, plan, nonces, Number(block.timestamp), { stockTokenIssuerControls: false });
    expect(beforeApprove.issues.map((i) => i.kind)).toEqual(["ALLOWANCE", "ALLOWANCE", "ALLOWANCE"]);

    for (const leg of plan.contractPlan.legs) {
      const wallet = wallets[owners.indexOf(leg.from)] as WalletClient;
      await publicClient.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: leg.token, abi: mock.abi, functionName: "approve", args: [settlement, leg.amount], account: wallet.account ?? leg.from, chain: foundry }) });
    }
    const ready = await preflightSettlement(publicClient, plan, nonces, Number(block.timestamp), { stockTokenIssuerControls: false });
    expect(ready.issues).toEqual([]);

    const before = new Map<string, bigint>();
    for (const key of expectedNetDeltas(plan).keys()) {
      const [owner, token] = key.split("|") as [Address, Address];
      before.set(key, (await publicClient.readContract({ address: token, abi: mock.abi, functionName: "balanceOf", args: [owner] })) as bigint);
    }
    const hash = await (wallets[0] as WalletClient).writeContract({
      address: settlement,
      abi: venue0SettlementAbi,
      functionName: "settle",
      args: [plan.contractPlan, approvals],
      account: (wallets[0] as WalletClient).account ?? owners[0] as Address,
      chain: foundry,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const verifierClient = createPublicClient({ chain: foundry, transport: http(anvil.rpcUrl) });
    const untouched = tokens.get("SPY") as Address;
    const report = await verifySettlement(verifierClient, { txHash: hash, settlementContract: settlement, plan: plan.contractPlan, nonces, watchTokens: [untouched] });
    expect(report.checks.filter((c) => c.status !== "PASS")).toEqual([]);
    expect(report.status).toBe("PASS");
    expect(report.balances.length).toBe(4 * 3);

    const tamperedPlan = { ...plan.contractPlan, legs: plan.contractPlan.legs.map((l, i) => (i === 0 ? { ...l, amount: l.amount + 1n } : l)) };
    const tampered = await verifySettlement(verifierClient, { txHash: hash, settlementContract: settlement, plan: tamperedPlan, nonces });
    expect(tampered.status).toBe("FAIL");
    expect(tampered.checks.filter((c) => c.status === "FAIL").map((c) => c.name)).toEqual(
      expect.arrayContaining(["calldata.plan", "event.PlanSettled", "event.CrossingLeg", "event.Transfer", "state.planSettled", "balances.netDelta"]),
    );

    const wrongNonces = new Map([...nonces].map(([p, n]) => [p, n + 1n]));
    const nonceReport = await verifySettlement(verifierClient, { txHash: hash, settlementContract: settlement, plan: plan.contractPlan, nonces: wrongNonces });
    expect(nonceReport.status).toBe("FAIL");
    for (const [key, delta] of expectedNetDeltas(plan)) {
      const [owner, token] = key.split("|") as [Address, Address];
      const after = (await publicClient.readContract({ address: token, abi: mock.abi, functionName: "balanceOf", args: [owner] })) as bigint;
      expect(after - (before.get(key) as bigint)).toBe(delta);
    }
  }, 90_000);
});
