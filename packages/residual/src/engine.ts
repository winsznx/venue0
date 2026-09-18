import { canTrade, type Session, type TradingCapabilities } from "@venue0/assets";

export const RESIDUAL_ENGINE_VERSION = "venue0-residual-2-economic";

export type ResidualDecision = "EXECUTE_NOW" | "LIMIT" | "TWAP" | "WAIT" | "CANCEL" | "AGGREGATE";

export type RouteStyle = "MARKET" | "LIMIT" | "TWAP";

export type ResidualPolicy = {
  urgency: "LOW" | "NORMAL" | "HIGH";
  /** Maximum all-in external execution cost the user accepts, in bps of residual notional. */
  maxExternalSlippageBps: number;
  maxReferencePriceDriftBps: number;
  allowMarketResidual: boolean;
  allowLimitResidual: boolean;
  allowTwapResidual: boolean;
  allowWaitResidual: boolean;
  maxTwapDurationSec?: number;
};

/**
 * Cost of sending one residual through one route. `allInCostUsd` = reference value given up minus reference value
 * received, plus any cost paid outside the trade (gas). Components are null when the provider data cannot separate them.
 */
export type RouteCostEstimate = {
  venue: "UNISWAP" | "FLASH";
  style: RouteStyle;
  providerFeeUsd: number | null;
  networkCostUsd: number | null;
  priceImpactUsd: number | null;
  allInCostUsd: number;
  allInCostBps: number;
  /** Size-independent part of the cost (flat provider fee, gas). Drives AGGREGATE. */
  fixedCostUsd: number;
  source: string;
  observedAt: string;
};

export type ResidualContext = {
  notionalUsd: number;
  session: Session;
  capabilities: TradingCapabilities;
  tradingHalt: boolean;
  /** Drift of the executable price from the round snapshot, in bps (absolute). */
  referenceDriftBps: number;
  routes: RouteCostEstimate[];
  /** Residual size at or above which slicing (TWAP) is considered. */
  twapThresholdUsd: number;
  /** True when a later Venue0 round (for example the circle's next scheduled round) can absorb this residual. */
  nextRoundAvailable: boolean;
};

export type EvaluatedRoute = RouteCostEstimate & { allowed: boolean; viable: boolean; note: string };

export type ResidualPlan = {
  engineVersion: string;
  decision: ResidualDecision;
  route: RouteCostEstimate | null;
  evaluated: EvaluatedRoute[];
  reasons: string[];
};

const DECISION_FOR_STYLE: Record<RouteStyle, ResidualDecision> = { MARKET: "EXECUTE_NOW", LIMIT: "LIMIT", TWAP: "TWAP" };

export function costBps(costUsd: number, notionalUsd: number): number {
  return notionalUsd > 0 ? Math.round((costUsd / notionalUsd) * 10_000) : Number.POSITIVE_INFINITY;
}

/** Builds a route estimate from reference values measured against a live quote. */
export function routeCost(input: {
  venue: RouteCostEstimate["venue"];
  style: RouteStyle;
  referenceInUsd: number;
  referenceOutUsd: number;
  providerFeeUsd: number | null;
  networkCostUsd: number | null;
  fixedCostUsd: number;
  source: string;
  observedAt: string;
}): RouteCostEstimate {
  const tradeLoss = input.referenceInUsd - input.referenceOutUsd;
  const allIn = tradeLoss + (input.networkCostUsd ?? 0);
  const impact = input.providerFeeUsd === null ? null : tradeLoss - input.providerFeeUsd;
  return {
    venue: input.venue,
    style: input.style,
    providerFeeUsd: input.providerFeeUsd,
    networkCostUsd: input.networkCostUsd,
    priceImpactUsd: impact,
    allInCostUsd: allIn,
    allInCostBps: costBps(allIn, input.referenceInUsd),
    fixedCostUsd: input.fixedCostUsd,
    source: input.source,
    observedAt: input.observedAt,
  };
}

/**
 * Chooses how an unmatched residual reaches the market by comparing the all-in cost of every allowed route against the
 * user's cost cap. It never executes a route whose cost exceeds the cap. When only the fixed part of the cost breaks the
 * cap and another Venue0 round is coming, it aggregates the residual into that round instead of paying the fee now.
 */
export function decideResidual(policy: ResidualPolicy, ctx: ResidualContext): ResidualPlan {
  const park = (reasons: string[], evaluated: EvaluatedRoute[] = []): ResidualPlan => ({
    engineVersion: RESIDUAL_ENGINE_VERSION,
    decision: policy.allowWaitResidual ? "WAIT" : "CANCEL",
    route: null,
    evaluated,
    reasons: policy.allowWaitResidual ? reasons : [...reasons, "user does not allow waiting"],
  });

  if (ctx.tradingHalt) return park(["trading halt on the underlying"]);
  if (!canTrade(ctx.capabilities, ctx.session, "fractional")) return park([`fractional trading not available in the ${ctx.session} session`]);
  if (ctx.referenceDriftBps > policy.maxReferencePriceDriftBps) {
    return park([`price drifted ${ctx.referenceDriftBps} bps from the round snapshot (limit ${policy.maxReferencePriceDriftBps})`]);
  }

  const cap = policy.maxExternalSlippageBps;
  const evaluated: EvaluatedRoute[] = ctx.routes.map((r) => {
    let allowed = true;
    let note = "";
    if (r.style === "MARKET" && !policy.allowMarketResidual) [allowed, note] = [false, "market residuals not allowed by user"];
    if (r.style === "LIMIT" && !policy.allowLimitResidual) [allowed, note] = [false, "limit residuals not allowed by user"];
    if (r.style === "TWAP" && !policy.allowTwapResidual) [allowed, note] = [false, "TWAP residuals not allowed by user"];
    if (r.style === "TWAP" && allowed && (ctx.notionalUsd < ctx.twapThresholdUsd || policy.urgency === "HIGH")) {
      [allowed, note] = [false, ctx.notionalUsd < ctx.twapThresholdUsd ? `below TWAP threshold $${ctx.twapThresholdUsd}` : "urgent residual"];
    }
    const viable = allowed && r.allInCostBps <= cap;
    if (allowed) note = viable ? `all-in ${r.allInCostBps} bps within cap ${cap}` : `all-in ${r.allInCostBps} bps exceeds cap ${cap}`;
    return { ...r, allowed, viable, note };
  });

  const viable = evaluated.filter((r) => r.viable);
  if (viable.length > 0) {
    const preferred = policy.urgency === "HIGH" ? viable.filter((r) => r.style === "MARKET") : [];
    const pool = preferred.length > 0 ? preferred : viable;
    const best = pool.reduce((a, b) => (b.allInCostUsd < a.allInCostUsd ? b : a));
    const alternatives = viable.filter((r) => r !== best).map((r) => `${r.venue} ${r.style} ${r.allInCostBps} bps`);
    return {
      engineVersion: RESIDUAL_ENGINE_VERSION,
      decision: DECISION_FOR_STYLE[best.style],
      route: best,
      evaluated,
      reasons: [`cheapest viable route ${best.venue} ${best.style} at ${best.allInCostBps} bps ($${best.allInCostUsd.toFixed(4)})`, ...(alternatives.length ? [`beat ${alternatives.join(", ")}`] : [])],
    };
  }

  const allowed = evaluated.filter((r) => r.allowed);
  if (allowed.length === 0) return park([ctx.routes.length === 0 ? "no external route available" : "no route style allowed by the user"], evaluated);

  const fixedDominated = allowed.filter((r) => costBps(r.allInCostUsd - r.fixedCostUsd, ctx.notionalUsd) <= cap);
  const cheapest = allowed.reduce((a, b) => (b.allInCostUsd < a.allInCostUsd ? b : a));
  const reasons = [`cheapest allowed route ${cheapest.venue} ${cheapest.style} costs ${cheapest.allInCostBps} bps, above cap ${cap}`];
  if (fixedDominated.length > 0 && ctx.nextRoundAvailable && policy.allowWaitResidual) {
    const r = fixedDominated[0] as EvaluatedRoute;
    return {
      engineVersion: RESIDUAL_ENGINE_VERSION,
      decision: "AGGREGATE",
      route: null,
      evaluated,
      reasons: [...reasons, `fixed cost $${r.fixedCostUsd.toFixed(4)} dominates a $${ctx.notionalUsd.toFixed(2)} residual; carry it into the next Venue0 round`],
    };
  }
  return park(reasons, evaluated);
}

/**
 * US equity session for a timestamp, using US Eastern daylight time (UTC-4), which covers September 2026.
 * Regular 09:30-16:00, extended 04:00-09:30 and 16:00-20:00, overnight otherwise and on weekends. Ignores US holidays.
 */
export function usEquitySession(at: Date): Session {
  const eastern = new Date(at.getTime() - 4 * 3600_000);
  const day = eastern.getUTCDay();
  const minutes = eastern.getUTCHours() * 60 + eastern.getUTCMinutes();
  if (day === 0 || day === 6) return "overnight";
  if (minutes >= 570 && minutes < 960) return "market";
  if ((minutes >= 240 && minutes < 570) || (minutes >= 960 && minutes < 1200)) return "extended";
  return "overnight";
}
