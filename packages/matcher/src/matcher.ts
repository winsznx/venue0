import { rawUnitsForValue, valueUsdE18 } from "@venue0/assets";
import { BPS, hashCanonical, mulDivDown, type Address, type AssetUid } from "@venue0/shared";
import {
  hashValuationSnapshot,
  intentProblems,
  priceMap,
  snapshotProblems,
  type PortfolioIntent,
} from "@venue0/portfolio";
import { minCostCirculation, type CirculationEdge } from "./circulation.ts";
import {
  DEFAULT_LOT_USD_E18,
  DEFAULT_RESIDUAL_DUST_USD_E18,
  SOLVER_VERSION,
  type AssetFill,
  type CycleHop,
  type MatchInput,
  type MatchLeg,
  type MatchResult,
  type MatchTotals,
  type ParticipantSummary,
  type RoundMatchStatus,
} from "./types.ts";

type Capacity = { owner: Address; assetUid: AssetUid; token: Address; side: "SELL" | "BUY"; raw: bigint; lots: bigint };

type SolvedFlow = { capacities: Capacity[]; flowLots: bigint[] };

const byAddress = (a: string, b: string) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);

/**
 * Portfolio crossing: maximize crossed value subject to per-asset sell caps, buy caps, and exact per-participant value
 * balance, under a single valuation snapshot. Deterministic for identical input.
 */
export function matchRound(input: MatchInput): MatchResult {
  const started = performance.now();
  const lot = input.lotUsdE18 ?? DEFAULT_LOT_USD_E18;
  const dust = input.residualDustUsdE18 ?? DEFAULT_RESIDUAL_DUST_USD_E18;
  if (lot <= 0n) throw new Error("lot size must be positive");
  if (dust < 0n) throw new Error("dust threshold must be non-negative");
  const snapshotHash = hashValuationSnapshot(input.snapshot);
  const prices = priceMap(input.snapshot);
  const intents = [...input.intents].sort((a, b) => byAddress(a.owner, b.owner));
  const inputHash = hashCanonical({ solverVersion: SOLVER_VERSION, roundId: input.roundId, snapshotHash, intents, nowSec: input.nowSec, lot, dust, universe: [...input.universe].sort() });

  const rejected = new Map<Address, string[]>();
  const owners = new Set<string>();
  const accepted: PortfolioIntent[] = [];
  for (const intent of intents) {
    const key = intent.owner.toLowerCase();
    const reasons = intentProblems(intent, { roundId: input.roundId, valuationSnapshotHash: snapshotHash, nowSec: input.nowSec, knownTokens: input.universe }).map((p) => p.reason);
    if (owners.has(key)) reasons.push("duplicate intent for owner");
    owners.add(key);
    for (const limit of intent.assets) if (!prices.has(limit.assetUid)) reasons.push(`no snapshot price for ${limit.assetUid}`);
    if (reasons.length > 0) rejected.set(intent.owner, reasons);
    else accepted.push(intent);
  }

  const stale = snapshotProblems(input.snapshot, input.nowSec);
  const statusReasons: string[] = [];
  let forcedStatus: RoundMatchStatus | undefined;
  if (stale.length > 0) {
    forcedStatus = "PLAN_STALE";
    statusReasons.push(...stale.map((p) => (p.assetUid ? `${p.assetUid}: ${p.reason}` : p.reason)));
  } else if (accepted.length < 2) {
    forcedStatus = "INSUFFICIENT_PARTICIPANTS";
    statusReasons.push(`${accepted.length} valid intent(s); crossing needs at least 2`);
  }

  const excluded = new Map<Address, string>();
  let solved: SolvedFlow = { capacities: buildCapacities(accepted, prices, lot), flowLots: [] };
  if (!forcedStatus) {
    for (;;) {
      const active = accepted.filter((i) => !excluded.has(i.owner));
      solved = solveCirculation(buildCapacities(active, prices, lot), active);
      const violator = worstPolicyViolation(active, solved);
      if (!violator) break;
      excluded.set(violator.owner, violator.reason);
      statusReasons.push(`excluded ${violator.owner}: ${violator.reason}`);
    }
  }

  const legs = forcedStatus ? [] : buildLegs(solved, prices, lot);
  const fills = buildFills(accepted, legs, prices, dust);
  const participants = summarize(intents, fills, legs, rejected, excluded);
  const totals = computeTotals(fills, legs, participants);
  const status = forcedStatus ?? (totals.crossedNotionalUsdE18 === 0n ? "NO_CROSS" : totals.externalResidualCount === 0 ? "CROSSED" : "PARTIAL_CROSS");
  const cycles = forcedStatus ? [] : explainCycles(legs);

  const body = {
    solverVersion: SOLVER_VERSION,
    roundId: input.roundId,
    valuationSnapshotHash: snapshotHash,
    nowSec: input.nowSec,
    lotUsdE18: lot,
    residualDustUsdE18: dust,
    inputHash,
    status,
    statusReasons,
    legs,
    fills,
    participants,
    cycles,
    totals,
  };
  return { ...body, solveMs: Math.round(performance.now() - started), outputHash: hashCanonical(body) };
}

function buildCapacities(intents: readonly PortfolioIntent[], prices: ReadonlyMap<AssetUid, bigint>, lot: bigint): Capacity[] {
  const capacities: Capacity[] = [];
  for (const intent of intents) {
    const limits = [...intent.assets].sort((a, b) => (a.assetUid < b.assetUid ? -1 : 1));
    for (const limit of limits) {
      const side = limit.maxOutRaw > 0n ? "SELL" : "BUY";
      const raw = side === "SELL" ? limit.maxOutRaw : limit.maxInRaw;
      const lots = valueUsdE18(raw, prices.get(limit.assetUid) as bigint) / lot;
      capacities.push({ owner: intent.owner, assetUid: limit.assetUid, token: limit.token, side, raw, lots });
    }
  }
  return capacities;
}

/**
 * Graph: participant -> asset edges carry what a participant sells, asset -> participant edges what it buys.
 * Flow conservation at an asset node is per-asset transfer conservation; at a participant node it is exact value balance.
 * Cost -1 on sell edges makes the min-cost circulation the maximum crossed value.
 */
function solveCirculation(capacities: Capacity[], intents: readonly PortfolioIntent[]): SolvedFlow {
  const ownerIndex = new Map(intents.map((intent, i) => [intent.owner, i]));
  const assetUids = [...new Set(capacities.map((c) => c.assetUid))].sort();
  const assetIndex = new Map(assetUids.map((uid, i) => [uid, intents.length + i]));
  const edges: CirculationEdge[] = capacities.map((c) => {
    const p = ownerIndex.get(c.owner) as number;
    const a = assetIndex.get(c.assetUid) as number;
    return c.side === "SELL" ? { from: p, to: a, capacity: c.lots, cost: -1 } : { from: a, to: p, capacity: c.lots, cost: 0 };
  });
  return { capacities, flowLots: minCostCirculation(intents.length + assetUids.length, edges) };
}

function worstPolicyViolation(intents: readonly PortfolioIntent[], solved: SolvedFlow): { owner: Address; reason: string } | undefined {
  let worst: { owner: Address; reason: string; ratio: bigint } | undefined;
  for (const intent of intents) {
    let sellLots = 0n;
    let buyLots = 0n;
    let outLots = 0n;
    solved.capacities.forEach((c, i) => {
      if (c.owner !== intent.owner) return;
      if (c.side === "SELL") {
        sellLots += c.lots;
        outLots += solved.flowLots[i] as bigint;
      } else buyLots += c.lots;
    });
    const attainable = sellLots < buyLots ? sellLots : buyLots;
    if (attainable === 0n) continue;
    const ratio = mulDivDown(outLots, BPS, attainable);
    const assetCount = BigInt(intent.assets.length);
    let required: bigint | undefined;
    if (!intent.policy.allowPartialCross) {
      if (outLots + assetCount < attainable) required = BPS;
    } else if (intent.policy.minCrossPercentBps !== undefined && ratio < BigInt(intent.policy.minCrossPercentBps)) {
      required = BigInt(intent.policy.minCrossPercentBps);
    }
    if (required === undefined) continue;
    if (!worst || ratio < worst.ratio || (ratio === worst.ratio && byAddress(intent.owner, worst.owner) < 0)) {
      worst = { owner: intent.owner, ratio, reason: `crossed ${ratio} bps of attainable value; policy requires ${required} bps` };
    }
  }
  return worst && { owner: worst.owner, reason: worst.reason };
}

/** Pairs sellers and buyers of each asset in address order. Produces at most sellers + buyers - 1 legs per asset. */
function buildLegs(solved: SolvedFlow, prices: ReadonlyMap<AssetUid, bigint>, lot: bigint): MatchLeg[] {
  const legs: MatchLeg[] = [];
  const byAsset = new Map<AssetUid, { sellers: Array<[Capacity, bigint]>; buyers: Array<[Capacity, bigint]> }>();
  solved.capacities.forEach((c, i) => {
    const f = solved.flowLots[i] as bigint;
    if (f === 0n) return;
    const entry = byAsset.get(c.assetUid) ?? { sellers: [], buyers: [] };
    (c.side === "SELL" ? entry.sellers : entry.buyers).push([c, f]);
    byAsset.set(c.assetUid, entry);
  });

  for (const uid of [...byAsset.keys()].sort()) {
    const { sellers, buyers } = byAsset.get(uid) as { sellers: Array<[Capacity, bigint]>; buyers: Array<[Capacity, bigint]> };
    sellers.sort((a, b) => byAddress(a[0].owner, b[0].owner));
    buyers.sort((a, b) => byAddress(a[0].owner, b[0].owner));
    const price = prices.get(uid) as bigint;
    let s = 0;
    let b = 0;
    while (s < sellers.length && b < buyers.length) {
      const seller = sellers[s] as [Capacity, bigint];
      const buyer = buyers[b] as [Capacity, bigint];
      const lots = seller[1] < buyer[1] ? seller[1] : buyer[1];
      const amountRaw = rawUnitsForValue(lots * lot, price);
      if (amountRaw === 0n) throw new Error(`leg for ${uid} rounds to zero raw units`);
      legs.push({ assetUid: uid, token: seller[0].token, from: seller[0].owner, to: buyer[0].owner, lots, amountRaw, valueUsdE18: valueUsdE18(amountRaw, price) });
      seller[1] -= lots;
      buyer[1] -= lots;
      if (seller[1] === 0n) s++;
      if (buyer[1] === 0n) b++;
    }
    if (s !== sellers.length || b !== buyers.length) throw new Error(`asset ${uid} flow is not conserved`);
  }
  return legs;
}

function buildFills(intents: readonly PortfolioIntent[], legs: readonly MatchLeg[], prices: ReadonlyMap<AssetUid, bigint>, dust: bigint): AssetFill[] {
  const fills: AssetFill[] = [];
  for (const intent of intents) {
    for (const limit of [...intent.assets].sort((a, b) => (a.assetUid < b.assetUid ? -1 : 1))) {
      const side = limit.maxOutRaw > 0n ? "SELL" : "BUY";
      const requestedRaw = side === "SELL" ? limit.maxOutRaw : limit.maxInRaw;
      const crossedRaw = legs
        .filter((l) => l.assetUid === limit.assetUid && (side === "SELL" ? l.from === intent.owner : l.to === intent.owner))
        .reduce((sum, l) => sum + l.amountRaw, 0n);
      if (crossedRaw > requestedRaw) throw new Error(`crossed ${crossedRaw} exceeds requested ${requestedRaw} for ${intent.owner}/${limit.assetUid}`);
      const price = prices.get(limit.assetUid) as bigint;
      const residualRaw = requestedRaw - crossedRaw;
      const residualValue = valueUsdE18(residualRaw, price);
      fills.push({
        owner: intent.owner,
        assetUid: limit.assetUid,
        token: limit.token,
        side,
        requestedRaw,
        crossedRaw,
        residualRaw,
        requestedValueUsdE18: valueUsdE18(requestedRaw, price),
        crossedValueUsdE18: valueUsdE18(crossedRaw, price),
        residualValueUsdE18: residualValue,
        residualClass: residualRaw === 0n ? "NONE" : residualValue < dust && crossedRaw > 0n ? "DUST" : "EXTERNAL",
      });
    }
  }
  return fills;
}

function summarize(
  intents: readonly PortfolioIntent[],
  fills: readonly AssetFill[],
  legs: readonly MatchLeg[],
  rejected: ReadonlyMap<Address, string[]>,
  excluded: ReadonlyMap<Address, string>,
): ParticipantSummary[] {
  return intents.map((intent) => {
    const own = fills.filter((f) => f.owner === intent.owner);
    const valueOut = legs.filter((l) => l.from === intent.owner).reduce((sum, l) => sum + l.valueUsdE18, 0n);
    const valueIn = legs.filter((l) => l.to === intent.owner).reduce((sum, l) => sum + l.valueUsdE18, 0n);
    const requested = own.reduce((sum, f) => sum + f.requestedValueUsdE18, 0n);
    const crossed = own.reduce((sum, f) => sum + f.crossedValueUsdE18, 0n);
    const rejectedReasons = rejected.get(intent.owner);
    const exclusion = excluded.get(intent.owner);
    const status = rejectedReasons
      ? "REJECTED"
      : exclusion
        ? "EXCLUDED_MIN_CROSS"
        : crossed === 0n
          ? "NOT_CROSSED"
          : own.every((f) => f.residualClass !== "EXTERNAL")
            ? "CROSSED"
            : "PARTIAL";
    return {
      owner: intent.owner,
      status,
      reasons: rejectedReasons ?? (exclusion ? [exclusion] : []),
      valueOutUsdE18: valueOut,
      valueInUsdE18: valueIn,
      imbalanceUsdE18: valueIn - valueOut,
      requestedNotionalUsdE18: requested,
      crossedNotionalUsdE18: crossed,
      crossRateBps: requested === 0n ? 0n : mulDivDown(crossed, BPS, requested),
    };
  });
}

function computeTotals(fills: readonly AssetFill[], legs: readonly MatchLeg[], participants: readonly ParticipantSummary[]): MatchTotals {
  const requested = fills.reduce((sum, f) => sum + f.requestedValueUsdE18, 0n);
  const crossed = fills.reduce((sum, f) => sum + f.crossedValueUsdE18, 0n);
  return {
    requestedNotionalUsdE18: requested,
    crossedNotionalUsdE18: crossed,
    residualNotionalUsdE18: fills.reduce((sum, f) => sum + f.residualValueUsdE18, 0n),
    dustResidualNotionalUsdE18: fills.filter((f) => f.residualClass === "DUST").reduce((sum, f) => sum + f.residualValueUsdE18, 0n),
    externalResidualCount: fills.filter((f) => f.residualClass === "EXTERNAL").length,
    crossRateBps: requested === 0n ? 0n : mulDivDown(crossed, BPS, requested),
    transferNotionalUsdE18: legs.reduce((sum, l) => sum + l.valueUsdE18, 0n),
    legCount: legs.length,
    participantCount: participants.filter((p) => p.status !== "REJECTED").length,
    crossingParticipantCount: participants.filter((p) => p.status === "CROSSED" || p.status === "PARTIAL").length,
  };
}

/**
 * Decomposes the participant transfer graph (in lots, where in == out exactly) into directed cycles for explanation.
 * Example output for the hero case: A -NVDA-> C -SPY-> B -AAPL-> A.
 */
export function explainCycles(legs: readonly MatchLeg[]): CycleHop[][] {
  const remaining = legs.map((l) => ({ from: l.from, to: l.to, assetUid: l.assetUid, lots: l.lots }));
  const cycles: CycleHop[][] = [];
  for (;;) {
    const start = remaining.find((h) => h.lots > 0n);
    if (!start) return cycles;
    const path: typeof remaining = [start];
    const visitedAt = new Map<string, number>([[start.from, 0]]);
    let current = start;
    for (;;) {
      const seen = visitedAt.get(current.to);
      if (seen !== undefined) {
        const cycle = path.slice(seen);
        const bottleneck = cycle.reduce((m, h) => (h.lots < m ? h.lots : m), current.lots);
        for (const hop of cycle) hop.lots -= bottleneck;
        cycles.push(cycle.map((h) => ({ from: h.from, to: h.to, assetUid: h.assetUid, lots: bottleneck })));
        break;
      }
      visitedAt.set(current.to, path.length);
      const next = remaining.find((h) => h.lots > 0n && h.from === current.to);
      if (!next) throw new Error(`participant ${current.to} receives value without sending; circulation broken`);
      path.push(next);
      current = next;
    }
  }
}
