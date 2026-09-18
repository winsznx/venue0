import { copyFile, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { maxCrossLp, type Offer } from "../../campaign/runner/lp.ts";

/**
 * Derives the frontend's view data from committed evidence only. Every number the UI shows as "live" or "verified"
 * comes from a file under evidence/ or campaign/results/. Re-run after new evidence: `pnpm web:data`.
 */
const OUT = "apps/web/data";
type J = Record<string, unknown>;
const read = async <T = J>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T;
const latest = async (dir: string) => join(dir, (await readdir(dir)).sort().at(-1) as string);
const e18 = (v: unknown) => Number(BigInt(String(v)) / 10n ** 12n) / 1e6;
const tokens = (v: unknown) => Number(BigInt(String(v)) / 10n ** 9n) / 1e9;
const EXPLORER = "https://robinhoodchain.blockscout.com";
const LOT = 0.01;

type Asset = { symbol: string; uid: string; address: string; priceUsd: number };

async function roundView(key: string, dir: string, labels: Record<string, { label: string; kind: string }>) {
  const run = await latest(join("evidence/live", dir));
  const has = async (f: string) => (await readdir(run)).includes(f);
  const summary = await read(join(run, "summary.json"));
  const match = await read(join(run, "matcher-output.json"));
  const intentsFile = await read<{ intents: Array<{ owner: string; assets: Array<{ assetUid: string; maxOutRaw: string; maxInRaw: string }>; policy: J }>; signatures: Record<string, string> }>(join(run, "intents.json"));
  const resolution = await read<{ assets: Array<{ token: { uid: string; symbol: string; contractAddress: string } }> }>(join(run, "asset-resolution.json"));
  const snapshot = await read<{ snapshotHash: string; snapshot: { capturedAt: number; source: string; prices: Array<{ assetUid: string; priceUsdE18: string; sourceTimestamp: number }> } }>(join(run, "valuation-snapshot.json"));
  const portfolios = await read<Array<{ address: string; rebalance: { allocationErrorBps: string; totalValueUsdE18: string; positions: Array<{ assetUid: string; valueUsdE18: string; targetValueUsdE18: string }> } }>>(join(run, "portfolios.json"));

  const assets: Asset[] = resolution.assets.map((a) => ({
    symbol: a.token.symbol,
    uid: a.token.uid,
    address: a.token.contractAddress,
    priceUsd: e18(snapshot.snapshot.prices.find((p) => p.assetUid === a.token.uid)?.priceUsdE18 ?? "0"),
  }));
  const sym = (uid: string) => assets.find((a) => a.uid === uid)?.symbol ?? uid.slice(0, 8);
  const who = (addr: string) => labels[addr.toLowerCase()] ?? { label: addr.slice(0, 8), kind: "unknown" };

  const participants = intentsFile.intents.map((i) => {
    const pf = portfolios.find((p) => p.address.toLowerCase() === i.owner.toLowerCase());
    return {
      address: i.owner,
      ...who(i.owner),
      valueUsd: pf ? e18(pf.rebalance.totalValueUsdE18) : null,
      allocationErrorBeforeBps: pf ? Number(pf.rebalance.allocationErrorBps) : null,
      intent: i.assets.map((l) => {
        const side = BigInt(l.maxOutRaw) > 0n ? "SELL" : "BUY";
        const raw = side === "SELL" ? l.maxOutRaw : l.maxInRaw;
        const a = assets.find((x) => x.uid === l.assetUid) as Asset;
        return { symbol: sym(l.assetUid), side, amountTokens: tokens(raw), valueUsd: tokens(raw) * a.priceUsd };
      }),
      signature: intentsFile.signatures[i.owner] ?? null,
      policy: i.policy,
    };
  });

  const m = match as { legs: Array<J>; fills: Array<J>; cycles: Array<Array<J>>; totals: J; status: string; participants: Array<J> };
  const legs = m.legs.map((l) => ({ from: String(l.from), to: String(l.to), symbol: sym(String(l.assetUid)), amountTokens: tokens(l.amountRaw), valueUsd: e18(l.valueUsdE18) }));
  const fills = m.fills.map((f) => ({ owner: String(f.owner), symbol: sym(String(f.assetUid)), side: String(f.side), requestedUsd: e18(f.requestedValueUsdE18), crossedUsd: e18(f.crossedValueUsdE18), residualUsd: e18(f.residualValueUsdE18), residualTokens: tokens(f.residualRaw), residualClass: String(f.residualClass) }));
  const cycles = m.cycles.map((c) => c.map((h) => ({ from: String(h.from), to: String(h.to), symbol: sym(String(h.assetUid)) })));

  // Pairwise-only comparison on this round's actual intents: exact LP optimum where each pair's swap balances in value.
  const sells: Offer[] = [];
  const buys: Offer[] = [];
  for (const p of participants) {
    for (const leg of p.intent) (leg.side === "SELL" ? sells : buys).push({ owner: p.address, asset: leg.symbol, lots: Math.floor(leg.valueUsd / LOT) });
  }
  const bilateral = await maxCrossLp(sells, buys, "BILATERAL");
  const requested = e18(m.totals.requestedNotionalUsdE18);

  const after = participants.map((p) => {
    const pf = portfolios.find((x) => x.address.toLowerCase() === p.address.toLowerCase());
    if (!pf) return null;
    const total = e18(pf.rebalance.totalValueUsdE18);
    let dist = 0;
    for (const pos of pf.rebalance.positions) {
      const symbol = sym(pos.assetUid);
      const delta = legs.filter((l) => l.symbol === symbol && l.to === p.address).reduce((s, l) => s + l.valueUsd, 0) - legs.filter((l) => l.symbol === symbol && l.from === p.address).reduce((s, l) => s + l.valueUsd, 0);
      dist += Math.abs(e18(pos.valueUsdE18) + delta - e18(pos.targetValueUsdE18));
    }
    return total > 0 ? Math.round((dist / (2 * total)) * 10_000) : 0;
  });

  const plan = (await has("settlement-plan.json")) ? await read<{ plan: J & { contractPlan: J }; approvals: Record<string, { nonce: string }>; allowanceTxs: string[]; preflight: J }>(join(run, "settlement-plan.json")) : null;
  const receipt = (await has("receipt.json")) ? await read(join(run, "receipt.json")) : null;
  const verifier = (await has("verifier-report.json")) ? await read<{ status: string; checks: Array<{ name: string; status: string; detail: string }> }>(join(run, "verifier-report.json")) : null;
  const independentFiles = (await readdir(run)).filter((f) => f.startsWith("verifier-report-independent"));
  const independent = await Promise.all(independentFiles.map((f) => read<{ provider?: string; status: string; checks: Array<{ name: string; status: string }> }>(join(run, f))));

  return {
    key,
    gate: summary.gate,
    description: summary.description,
    environment: summary.environment,
    evidencePath: run,
    roundId: summary.roundId,
    status: m.status,
    result: summary.result,
    capturedAt: new Date(snapshot.snapshot.capturedAt * 1000).toISOString(),
    snapshot: { hash: snapshot.snapshotHash, source: snapshot.snapshot.source },
    assets,
    participants: participants.map((p, i) => ({ ...p, allocationErrorAfterBps: after[i] })),
    legs,
    fills,
    cycles,
    totals: {
      requestedUsd: requested,
      crossedUsd: e18(m.totals.crossedNotionalUsdE18),
      residualUsd: e18(m.totals.residualNotionalUsdE18),
      dustUsd: e18(m.totals.dustResidualNotionalUsdE18),
      transferUsd: e18(m.totals.transferNotionalUsdE18),
      crossRateBps: Number(m.totals.crossRateBps),
      externalResidualCount: Number(m.totals.externalResidualCount),
    },
    comparison: {
      marketOnly: { externalOrders: participants.reduce((n, p) => n + p.intent.length, 0), crossedUsd: 0 },
      pairwise: {
        crossedUsd: bilateral.crossedLots * LOT * 2,
        transfers: bilateral.transfers.map((t) => ({ from: t.from, to: t.to, symbol: t.asset, valueUsd: t.lots * LOT })),
        method: "exact LP optimum over pairwise value-balanced swaps (HiGHS), same intents",
      },
      venue0: { crossedUsd: e18(m.totals.crossedNotionalUsdE18), externalOrders: Number(m.totals.externalResidualCount) },
    },
    plan: plan && {
      planHash: plan.plan.planHash,
      validAfter: Number(plan.plan.contractPlan.validAfter),
      validUntil: Number(plan.plan.contractPlan.validUntil),
      settlementContract: plan.plan.settlementContract,
      approvals: Object.entries(plan.approvals).map(([participant, a]) => ({ participant, nonce: a.nonce })),
      allowanceTxs: plan.allowanceTxs,
      preflightOk: plan.preflight.ok,
      residuals: (plan.plan.residuals as Array<J>).map((r) => ({ owner: String(r.owner), symbol: sym(String(r.assetUid)), side: String(r.side), amountTokens: tokens(r.amountRaw), notionalUsd: e18(r.notionalUsdE18), residualClass: String(r.residualClass) })),
    },
    settlement: receipt && {
      txHash: String(receipt.transactionHash),
      block: Number(receipt.blockNumber),
      gasUsed: Number(receipt.gasUsed),
      status: String(receipt.status),
      explorer: `${EXPLORER}/tx/${String(receipt.transactionHash)}`,
    },
    verifier: verifier && { status: verifier.status, checks: verifier.checks.map((c) => ({ name: c.name, status: c.status, detail: c.detail })) },
    independentVerification: independent.map((r) => ({ provider: r.provider ?? "unknown", status: r.status, passed: r.checks.filter((c) => c.status === "PASS").length, total: r.checks.length })),
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const labels: Record<string, { label: string; kind: string }> = {
    "0x71509d21a26f47f83b36a835bb4619df8f512718": { label: "Portfolio A", kind: "operator proof wallet" },
    "0x0f199cc71f82f1baa7d731cbd03c6f8895a9d70d": { label: "Portfolio B", kind: "operator proof wallet" },
    "0x69a0ba2cb75ce834ffbaa258ea2342f862903cae": { label: "Portfolio C", kind: "operator proof wallet" },
    "0x00db4b5f745da1351eaf687c39107c54e344e87c": { label: "Agent D", kind: "Dynamic server wallet (agent)" },
  };
  const rounds = [];
  for (const [key, dir] of [["g2-cycle", "L2-cycle"], ["g1-bilateral", "L1-bilateral"], ["g3-partial", "L3-partial"], ["g4-no-cross", "L4-no-cross"], ["l7-dynamic", "L7-dynamic-agent"], ["l6-flash-round", "L6-flash-round"]] as const) {
    rounds.push(await roundView(key, dir, labels));
    console.log("round", key);
  }
  await writeFile(`${OUT}/rounds.json`, `${JSON.stringify(rounds, null, 1)}\n`);

  const l0 = await read(join(await latest("evidence/live/L0-transfer"), "summary.json"));
  const l5 = await read<{ outcome: J; residualSell: J; explorer: string; result: string; timestamp: string }>(join(await latest("evidence/live/L5-residual"), "summary.json"));
  const l6run = await latest("evidence/live/L6-flash-residual");
  const l6 = await read<{ execution: J & { statusHistory: Array<{ status: string; raw: J }> }; limitCrossPrice: string; residualSell: J; timestamp: string }>(join(l6run, "summary.json"));
  const l6fill = await read(join(l6run, "fill-readback.json"));
  const decision = await read<{ decision: J; decisionContext: J; timestamp: string }>(join(await latest("evidence/live/L6-residual-decision"), "summary.json"));
  const campaign = await read("campaign/results/summary.json");
  const analysis = await read("campaign/results/analysis.json");
  const manifest = await read("campaign/manifest.json");

  await writeFile(`${OUT}/proof.json`, `${JSON.stringify({
    settlementContract: { address: "0x9cf871315674830046ab0541ee018f6978e86a3d", explorer: `${EXPLORER}/address/0x9cf871315674830046ab0541ee018f6978e86a3d`, deployTx: "0x071ee0c035695bcfdfad52ce9e7f11fec5b19a97e6ca80d06e74323ce8d71947" },
    transfer: { result: l0.result, txHash: l0.txHash, explorer: l0.explorer, asset: (l0.asset as J).symbol, amountTokens: tokens(l0.amountRaw) },
    uniswap: { result: l5.result, txHash: l5.outcome.swapTx, approvalTx: l5.outcome.approvalTx, explorer: l5.explorer, route: l5.outcome.routeString, routing: l5.outcome.routing, routerVersion: l5.outcome.routerVersion, soldTokens: tokens(l5.residualSell.amountRaw), soldSymbol: "NVDA", receivedTokens: tokens(l5.outcome.quotedAmountOut), receivedSymbol: "AAPL", at: l5.timestamp },
    flash: {
      orderId: l6.execution.orderId,
      status: l6.execution.statusHistory.at(-1)?.status,
      fillTx: (l6.execution.statusHistory.at(-1)?.raw.fills as Array<J> | undefined)?.[0]?.transactionId,
      limitCrossPrice: l6.limitCrossPrice,
      residualTokens: tokens(l6.residualSell.amountRaw),
      economics: l6fill.economics,
      at: l6.timestamp,
    },
    residualDecisionReplay: { at: decision.timestamp, decision: decision.decision, context: decision.decisionContext },
    campaign: { summary: campaign, analysis, manifest },
  }, null, 1)}\n`);
  await mkdir("apps/web/public/campaign", { recursive: true });
  for (const [from, to] of [
    ["campaign/results/results.csv", "results.csv"],
    ["campaign/results/results.json", "results.json"],
    ["campaign/results/summary.json", "summary.json"],
    ["campaign/results/analysis.json", "analysis.json"],
    ["campaign/manifest.json", "manifest.json"],
    ["docs/EVAL_CAMPAIGN.md", "methodology.md"],
    ["docs/CAMPAIGN_RESULTS.md", "results.md"],
  ] as const) await copyFile(from, `apps/web/public/campaign/${to}`);
  console.log("proof data written");
}

await main();
