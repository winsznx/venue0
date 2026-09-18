import type { Address } from "viem";
import { parseTradingCapabilities, rawUnitsForValue, valueUsdE18, type PriceSnapshot } from "@venue0/assets";
import { matchRound, DEFAULT_LOT_USD_E18, DEFAULT_RESIDUAL_DUST_USD_E18, type MatchResult } from "@venue0/matcher";
import {
  applyRawDeltas,
  buildValuationSnapshot,
  computeRebalance,
  deltaLimits,
  hashPolicy,
  hashValuationSnapshot,
  type AssetDeltaLimit,
  type ExecutionPolicy,
  type PortfolioIntent,
  type RebalancePlan,
  type ValuationSnapshot,
} from "@venue0/portfolio";
import { compareWithReference } from "@venue0/reference-matcher";
import { decideResidual, type ResidualDecision, type ResidualPolicy, type RouteCostEstimate } from "@venue0/residual";
import type { AssetUid, Hex } from "@venue0/shared";
import { usdToRaw, type Scenario, type UniverseAsset } from "../scenarios/generate.ts";
import type { CostModel } from "./cost-model.ts";
import { maxCrossLp, type Offer } from "./lp.ts";

export type Arm = "MARKET_ONLY" | "BILATERAL_ONLY" | "VENUE0_CROSSING" | "VENUE0_FULL";
export const ARMS: Arm[] = ["MARKET_ONLY", "BILATERAL_ONLY", "VENUE0_CROSSING", "VENUE0_FULL"];

const ROUND_ID = `0x${"c0".repeat(32)}` as Hex;
const CIRCLE_ID = `0x${"c1".repeat(32)}` as Hex;
const LOT_USD = Number(DEFAULT_LOT_USD_E18) / 1e18;
const DUST_USD = Number(DEFAULT_RESIDUAL_DUST_USD_E18) / 1e18;
const TRADABLE = parseTradingCapabilities({
  market: { whole: "TRADING_STATUS_TRADABLE", fractional: "TRADING_STATUS_TRADABLE" },
  extended: { whole: "TRADING_STATUS_TRADABLE", fractional: "TRADING_STATUS_TRADABLE" },
  overnight: { whole: "TRADING_STATUS_TRADABLE", fractional: "TRADING_STATUS_TRADABLE" },
});
const usd = (e18: bigint) => Number(e18 / 10n ** 12n) / 1e6;

/** One requested asset order, identical for every arm. */
type Order = { owner: Address; uid: AssetUid; symbol: string; side: "SELL" | "BUY"; valueUsd: number };

export type ArmRow = {
  scenario_id: string;
  cohort: string;
  nature: string;
  arm: Arm;
  participants: number;
  assets: number;
  requested_notional: number;
  crossed_notional: number;
  cross_rate: number;
  residual_notional: number;
  dust_residual_notional: number;
  external_order_count: number;
  external_notional_executed: number;
  unfilled_notional: number;
  deferred_notional: number;
  cancelled_notional: number;
  est_external_cost_usd: number;
  est_external_cost_bps: number | null;
  provider_fee_usd: number;
  cost_extrapolated_orders: number;
  bilateral_crossed_notional: number;
  venue0_crossed_notional: number;
  multi_party_uplift: number;
  multi_party_uplift_pct: number | null;
  complementarity: number;
  solver_latency_ms: number;
  reference_matcher_parity: string;
  allocation_error_before_bps: number;
  allocation_error_after_bps: number | null;
  status: string;
  residual_decisions: string;
};

export function defaultPolicy(validUntil: number, restrictMarket: boolean): ExecutionPolicy {
  return {
    maxExternalSlippageBps: 50,
    maxReferencePriceDriftBps: 100,
    maxRoundDurationSec: 900,
    allowPartialCross: true,
    allowMarketResidual: !restrictMarket,
    allowLimitResidual: true,
    allowTwapResidual: true,
    allowWaitResidual: true,
    urgency: "NORMAL",
    validUntil,
  };
}

export function frozenSnapshot(universe: UniverseAsset[], capturedAt: number): ValuationSnapshot {
  const prices: PriceSnapshot[] = universe.map((a) => ({
    assetUid: a.uid,
    tokenAddress: a.token,
    chainId: 4663,
    priceUsdE18: a.priceUsdE18,
    source: "CHAINLINK_STOCK_TOKEN_FEED",
    sourceTimestamp: capturedAt,
    stale: false,
  }));
  return buildValuationSnapshot(prices, capturedAt, 3_600);
}

type Built = {
  intents: PortfolioIntent[];
  orders: Order[];
  plans: Map<Address, RebalancePlan>;
  prices: Map<AssetUid, bigint>;
  symbolOf: Map<AssetUid, string>;
};

function build(scenario: Scenario, universe: UniverseAsset[], snapshot: ValuationSnapshot, nowSec: number): Built {
  const bySymbol = new Map(universe.map((a) => [a.symbol, a]));
  const prices = new Map(universe.map((a) => [a.uid, a.priceUsdE18]));
  const tokens = new Map(universe.map((a) => [a.uid, a.token]));
  const symbolOf = new Map(universe.map((a) => [a.uid, a.symbol]));
  const snapshotHash = hashValuationSnapshot(snapshot);
  const intents: PortfolioIntent[] = [];
  const orders: Order[] = [];
  const plans = new Map<Address, RebalancePlan>();

  for (const p of scenario.participants) {
    const holdings = Object.entries(p.holdingsUsd).map(([symbol, v]) => {
      const a = bySymbol.get(symbol) as UniverseAsset;
      return { owner: p.owner, assetUid: a.uid, token: a.token, rawBalance: usdToRaw(v, a.priceUsdE18) };
    });
    const targets = Object.entries(p.targetUsd).map(([symbol, v]) => ({ assetUid: (bySymbol.get(symbol) as UniverseAsset).uid, targetValueUsdE18: BigInt(Math.floor(v * 1e6)) * 10n ** 12n }));
    const plan = computeRebalance(holdings, { account: p.owner, targets }, prices, tokens);
    plans.set(p.owner, plan);
    const limits: AssetDeltaLimit[] = deltaLimits(plan, prices, DEFAULT_LOT_USD_E18);
    for (const l of limits) {
      const side = l.maxOutRaw > 0n ? "SELL" : "BUY";
      orders.push({ owner: p.owner, uid: l.assetUid, symbol: symbolOf.get(l.assetUid) as string, side, valueUsd: usd(valueUsdE18(l.maxOutRaw + l.maxInRaw, prices.get(l.assetUid) as bigint)) });
    }
    const policy = defaultPolicy(nowSec + 3_600, p.restrictMarket);
    intents.push({
      owner: p.owner,
      agent: p.owner,
      circleId: CIRCLE_ID,
      roundId: ROUND_ID,
      valuationSnapshotHash: snapshotHash,
      policyHash: hashPolicy(policy),
      policy,
      assets: limits,
      nonce: 1n,
      validAfter: nowSec - 60,
      validUntil: nowSec + 3_600,
    });
  }
  return { intents, orders, plans, prices, symbolOf };
}

const lotsOf = (valueUsd: number) => Math.floor(valueUsd / LOT_USD);

/** Share of requested value that could cross if value balance were the only constraint: sum over assets of min(sell, buy). */
function complementarity(orders: Order[]): number {
  const sell = new Map<string, number>();
  const buy = new Map<string, number>();
  for (const o of orders) (o.side === "SELL" ? sell : buy).set(o.uid, ((o.side === "SELL" ? sell : buy).get(o.uid) ?? 0) + o.valueUsd);
  let matched = 0;
  for (const [uid, s] of sell) matched += Math.min(s, buy.get(uid) ?? 0);
  const total = orders.reduce((acc, o) => acc + o.valueUsd, 0);
  return total > 0 ? (2 * matched) / total : 0;
}

type Residual = { order: Order; residualUsd: number; crossedUsd: number };

function classify(r: Residual): "NONE" | "DUST" | "EXTERNAL" {
  if (r.residualUsd <= 0) return "NONE";
  return r.residualUsd < DUST_USD && r.crossedUsd > 0 ? "DUST" : "EXTERNAL";
}

type Execution = { executed: number; unfilled: number; deferred: number; cancelled: number; cost: number; providerFee: number; extrapolated: number; decisions: Map<ResidualDecision | "MARKET" | "NO_ROUTE", number> };

function newExecution(): Execution {
  return { executed: 0, unfilled: 0, deferred: 0, cancelled: 0, cost: 0, providerFee: 0, extrapolated: 0, decisions: new Map() };
}

const bump = (e: Execution, k: ResidualDecision | "MARKET" | "NO_ROUTE") => e.decisions.set(k, (e.decisions.get(k) ?? 0) + 1);

/** Arms A-C: every external residual goes immediately to the simple route (Uniswap market). */
function executeImmediate(residuals: Residual[], costs: CostModel, scenario: Scenario): Execution {
  const e = newExecution();
  for (const r of residuals) {
    if (classify(r) !== "EXTERNAL") continue;
    const est = costs.estimate("UNISWAP", r.order.symbol, r.order.side, r.residualUsd, { multiplier: scenario.costMultiplier, unavailableUniswap: scenario.unavailableUniswap });
    if (!est.available) {
      e.unfilled += r.residualUsd;
      bump(e, "NO_ROUTE");
      continue;
    }
    e.executed += r.residualUsd;
    e.cost += est.costUsd;
    if (est.extrapolated) e.extrapolated++;
    bump(e, "MARKET");
  }
  return e;
}

/** Arm D: the economic residual engine chooses among measured routes per residual. */
function executeEconomic(residuals: Residual[], costs: CostModel, scenario: Scenario, policies: Map<Address, ResidualPolicy>): Execution {
  const e = newExecution();
  const stress = { multiplier: scenario.costMultiplier, unavailableUniswap: scenario.unavailableUniswap };
  for (const r of residuals) {
    if (classify(r) !== "EXTERNAL") continue;
    const routes: RouteCostEstimate[] = [];
    for (const [venue, style] of [["UNISWAP", "MARKET"], ["FLASH", "LIMIT"]] as const) {
      const est = costs.estimate(venue, r.order.symbol, r.order.side, r.residualUsd, stress);
      if (!est.available) continue;
      routes.push({
        venue,
        style,
        providerFeeUsd: venue === "FLASH" ? est.costUsd : null,
        networkCostUsd: null,
        priceImpactUsd: null,
        allInCostUsd: est.costUsd,
        allInCostBps: Math.round((est.costUsd / r.residualUsd) * 10_000),
        fixedCostUsd: est.fixedCostUsd,
        source: est.extrapolated ? "cost-model (extrapolated)" : "cost-model",
        observedAt: "frozen",
      });
    }
    const plan = decideResidual(policies.get(r.order.owner) as ResidualPolicy, {
      notionalUsd: r.residualUsd,
      session: "market",
      capabilities: TRADABLE,
      tradingHalt: false,
      referenceDriftBps: 0,
      routes,
      twapThresholdUsd: 1_000,
      nextRoundAvailable: true,
    });
    bump(e, plan.decision);
    if (plan.route) {
      e.executed += r.residualUsd;
      e.cost += plan.route.allInCostUsd;
      if (plan.route.venue === "FLASH") e.providerFee += plan.route.allInCostUsd;
      if (plan.route.source.includes("extrapolated")) e.extrapolated++;
    } else if (plan.decision === "CANCEL") e.cancelled += r.residualUsd;
    else e.deferred += r.residualUsd;
  }
  return e;
}

function allocationError(plans: Map<Address, RebalancePlan>, pick: (owner: Address, plan: RebalancePlan) => RebalancePlan): number {
  let weighted = 0;
  let total = 0;
  for (const [owner, plan] of plans) {
    const after = pick(owner, plan);
    weighted += Number(after.allocationErrorBps) * usd(plan.totalValueUsdE18);
    total += usd(plan.totalValueUsdE18);
  }
  return total > 0 ? Math.round(weighted / total) : 0;
}

export async function evaluateScenario(scenario: Scenario, universe: UniverseAsset[], snapshot: ValuationSnapshot, nowSec: number, costs: CostModel): Promise<ArmRow[]> {
  const built = build(scenario, universe, snapshot, nowSec);
  const { orders, intents, plans, prices } = built;
  const requested = orders.reduce((s, o) => s + o.valueUsd, 0);
  const assets = new Set(orders.map((o) => o.uid)).size;
  const comp = complementarity(orders);
  const key = (owner: string, uid: string) => `${owner}|${uid}`;

  // VENUE0 production matcher.
  const match: MatchResult = matchRound({ roundId: ROUND_ID, snapshot, intents, universe: new Map(universe.map((a) => [a.uid, a.token])), nowSec });
  const crossedByKey = new Map<string, number>();
  for (const f of match.fills) crossedByKey.set(key(f.owner, f.assetUid), usd(f.crossedValueUsdE18));
  const venue0Crossed = [...crossedByKey.values()].reduce((a, b) => a + b, 0);

  // Correctness oracle: exact reference for small rounds, HiGHS portfolio LP for larger ones.
  const sells: Offer[] = [];
  const buys: Offer[] = [];
  const accepted = new Set(match.participants.filter((p) => p.status !== "REJECTED").map((p) => p.owner));
  for (const i of intents) {
    for (const l of i.assets) {
      const lots = lotsOf(usd(valueUsdE18(l.maxOutRaw + l.maxInRaw, prices.get(l.assetUid) as bigint)));
      (l.maxOutRaw > 0n ? sells : buys).push({ owner: i.owner, asset: l.assetUid, lots });
    }
  }
  let parity: string;
  const productionLots = match.legs.reduce((s, l) => s + Number(l.lots), 0);
  if (accepted.size <= 6) {
    const ref = compareWithReference(match, { roundId: ROUND_ID, snapshot, intents, universe: new Map(universe.map((a) => [a.uid, a.token])), nowSec });
    parity = ref.ok ? "EXACT_PASS" : `EXACT_FAIL:${[...ref.validationIssues, ...ref.eligibilityDisagreements].slice(0, 2).join("|") || "objective"}`;
  } else {
    const lp = await maxCrossLp(sells.filter((s) => accepted.has(s.owner as Address)), buys.filter((b) => accepted.has(b.owner as Address)), "PORTFOLIO");
    parity = Math.abs(lp.crossedLots - productionLots) <= 1 ? "LP_PASS" : `LP_FAIL:${lp.crossedLots.toFixed(2)}vs${productionLots}`;
  }

  // BILATERAL_ONLY baseline: exact LP optimum over pairwise value-balanced swaps, same eligible participants and caps.
  const bilateral = await maxCrossLp(sells.filter((s) => accepted.has(s.owner as Address)), buys.filter((b) => accepted.has(b.owner as Address)), "BILATERAL");
  const bilateralByKey = new Map<string, number>();
  for (const t of bilateral.transfers) {
    bilateralByKey.set(key(t.from, t.asset), (bilateralByKey.get(key(t.from, t.asset)) ?? 0) + t.lots * LOT_USD);
    bilateralByKey.set(key(t.to, t.asset), (bilateralByKey.get(key(t.to, t.asset)) ?? 0) + t.lots * LOT_USD);
  }
  const bilateralCrossed = [...bilateralByKey.values()].reduce((a, b) => a + b, 0);

  const residualsFor = (crossed: Map<string, number>): Residual[] =>
    orders.map((o) => {
      const c = Math.min(crossed.get(key(o.owner, o.uid)) ?? 0, o.valueUsd);
      return { order: o, crossedUsd: c, residualUsd: Math.max(0, o.valueUsd - c) };
    });

  const policies = new Map(intents.map((i) => [i.owner, i.policy as ResidualPolicy]));
  const armInputs: Record<Arm, { crossed: number; residuals: Residual[]; exec: Execution; latency: number; status: string }> = (() => {
    const marketResiduals = residualsFor(new Map());
    const bilateralResiduals = residualsFor(bilateralByKey);
    const venue0Residuals = residualsFor(crossedByKey);
    return {
      MARKET_ONLY: { crossed: 0, residuals: marketResiduals, exec: executeImmediate(marketResiduals, costs, scenario), latency: 0, status: "MARKET_ONLY" },
      BILATERAL_ONLY: { crossed: bilateralCrossed, residuals: bilateralResiduals, exec: executeImmediate(bilateralResiduals, costs, scenario), latency: bilateral.ms, status: bilateralCrossed > 0 ? "CROSSED_BILATERAL" : "NO_CROSS" },
      VENUE0_CROSSING: { crossed: venue0Crossed, residuals: venue0Residuals, exec: executeImmediate(venue0Residuals, costs, scenario), latency: match.solveMs, status: match.status },
      VENUE0_FULL: { crossed: venue0Crossed, residuals: venue0Residuals, exec: executeEconomic(venue0Residuals, costs, scenario, policies), latency: match.solveMs, status: match.status },
    };
  })();

  const before = allocationError(plans, (_o, plan) => plan);
  /** Allocation error after crossing, before any external execution. Venue0 uses exact fill raw amounts; bilateral converts LP value. */
  const afterVenue0 = allocationError(plans, (owner, plan) => {
    const deltas = new Map<AssetUid, bigint>();
    for (const f of match.fills) if (f.owner === owner) deltas.set(f.assetUid, f.side === "SELL" ? -f.crossedRaw : f.crossedRaw);
    return applyRawDeltas(plan, deltas, prices);
  });
  const afterBilateral = allocationError(plans, (owner, plan) => {
    const deltas = new Map<AssetUid, bigint>();
    for (const o of orders) {
      if (o.owner !== owner) continue;
      const raw = rawUnitsForValue(BigInt(Math.floor((bilateralByKey.get(key(o.owner, o.uid)) ?? 0) * 1e6)) * 10n ** 12n, prices.get(o.uid) as bigint);
      deltas.set(o.uid, o.side === "SELL" ? -raw : raw);
    }
    return applyRawDeltas(plan, deltas, prices);
  });

  const uplift = venue0Crossed - bilateralCrossed;
  return ARMS.map((arm) => {
    const a = armInputs[arm];
    const residualTotal = a.residuals.reduce((s, r) => s + r.residualUsd, 0);
    const dust = a.residuals.filter((r) => classify(r) === "DUST").reduce((s, r) => s + r.residualUsd, 0);
    const external = a.residuals.filter((r) => classify(r) === "EXTERNAL").length;
    return {
      scenario_id: scenario.id,
      cohort: scenario.cohort,
      nature: scenario.nature,
      arm,
      participants: scenario.participants.length,
      assets,
      requested_notional: requested,
      crossed_notional: a.crossed,
      cross_rate: requested > 0 ? a.crossed / requested : 0,
      residual_notional: residualTotal,
      dust_residual_notional: dust,
      external_order_count: arm === "VENUE0_FULL" ? ["EXECUTE_NOW", "LIMIT", "TWAP"].reduce((n, k) => n + (a.exec.decisions.get(k as ResidualDecision) ?? 0), 0) : external,
      external_notional_executed: a.exec.executed,
      unfilled_notional: a.exec.unfilled,
      deferred_notional: a.exec.deferred,
      cancelled_notional: a.exec.cancelled,
      est_external_cost_usd: a.exec.cost,
      est_external_cost_bps: a.exec.executed > 0 ? Math.round((a.exec.cost / a.exec.executed) * 10_000) : null,
      provider_fee_usd: a.exec.providerFee,
      cost_extrapolated_orders: a.exec.extrapolated,
      bilateral_crossed_notional: bilateralCrossed,
      venue0_crossed_notional: venue0Crossed,
      multi_party_uplift: uplift,
      multi_party_uplift_pct: bilateralCrossed > 0 ? uplift / bilateralCrossed : null,
      complementarity: comp,
      solver_latency_ms: Math.round(a.latency * 100) / 100,
      reference_matcher_parity: arm === "VENUE0_CROSSING" || arm === "VENUE0_FULL" ? parity : "n/a",
      allocation_error_before_bps: before,
      allocation_error_after_bps: arm === "MARKET_ONLY" ? null : arm === "BILATERAL_ONLY" ? afterBilateral : afterVenue0,
      status: a.status,
      residual_decisions: [...a.exec.decisions].map(([k, v]) => `${k}:${v}`).join(" "),
    };
  });
}

