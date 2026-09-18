import { canTrade, type Session, type TradingCapabilities } from "@venue0/assets";

export type ResidualDecision = "EXECUTE_NOW" | "LIMIT" | "TWAP" | "WAIT" | "CANCEL";

export type ResidualPolicy = {
  urgency: "LOW" | "NORMAL" | "HIGH";
  maxExternalSlippageBps: number;
  maxReferencePriceDriftBps: number;
  allowMarketResidual: boolean;
  allowLimitResidual: boolean;
  allowTwapResidual: boolean;
  allowWaitResidual: boolean;
  maxTwapDurationSec?: number;
};

export type ResidualContext = {
  /** Residual notional in USD (display precision is enough; no settlement arithmetic happens here). */
  notionalUsd: number;
  /** Session the asset is in right now, derived from Robinhood trading capabilities and the clock. */
  session: Session;
  capabilities: TradingCapabilities;
  tradingHalt: boolean;
  /** Drift of the current executable price from the round's valuation snapshot, in bps (absolute). */
  referenceDriftBps: number;
  /** Best immediate route cost (fees + impact) in bps, undefined when no route exists. */
  immediateCostBps?: number;
  /** Advanced-order venue availability and its estimated cost in bps. */
  advancedVenueAvailable: boolean;
  advancedCostBps?: number;
  /** Size above which slicing is preferred over a single print. */
  twapThresholdUsd: number;
};

export type ResidualPlan = { decision: ResidualDecision; venue: "UNISWAP" | "FLASH" | "NONE"; reasons: string[] };

const park = (policy: ResidualPolicy, reasons: string[]): ResidualPlan =>
  policy.allowWaitResidual ? { decision: "WAIT", venue: "NONE", reasons } : { decision: "CANCEL", venue: "NONE", reasons };

/**
 * Chooses how an unmatched residual reaches the market. It is an execution-choice system: every branch names a way to
 * act (now, limit, sliced, later) or explains why the user's own constraints cancel it.
 */
export function decideResidual(policy: ResidualPolicy, ctx: ResidualContext): ResidualPlan {
  const reasons: string[] = [];
  if (ctx.tradingHalt) return park(policy, ["trading halt on the underlying"]);
  if (!canTrade(ctx.capabilities, ctx.session, "fractional")) {
    return park(policy, [`fractional trading not available in the ${ctx.session} session`]);
  }
  if (ctx.referenceDriftBps > policy.maxReferencePriceDriftBps) {
    return park(policy, [`price drifted ${ctx.referenceDriftBps} bps from the round snapshot (limit ${policy.maxReferencePriceDriftBps})`]);
  }

  const immediateOk = ctx.immediateCostBps !== undefined && ctx.immediateCostBps <= policy.maxExternalSlippageBps;
  if (policy.allowMarketResidual && immediateOk && (policy.urgency === "HIGH" || ctx.notionalUsd < ctx.twapThresholdUsd)) {
    return { decision: "EXECUTE_NOW", venue: "UNISWAP", reasons: [`immediate cost ${ctx.immediateCostBps} bps within ${policy.maxExternalSlippageBps} bps`] };
  }
  if (!policy.allowMarketResidual) reasons.push("user does not allow market residuals");
  else if (!immediateOk) reasons.push(ctx.immediateCostBps === undefined ? "no immediate route" : `immediate cost ${ctx.immediateCostBps} bps exceeds ${policy.maxExternalSlippageBps} bps`);

  if (!ctx.advancedVenueAvailable) return park(policy, [...reasons, "no advanced-order venue available"]);

  if (policy.allowTwapResidual && ctx.notionalUsd >= ctx.twapThresholdUsd && policy.urgency !== "HIGH") {
    return { decision: "TWAP", venue: "FLASH", reasons: [...reasons, `residual $${ctx.notionalUsd.toFixed(2)} at or above TWAP threshold $${ctx.twapThresholdUsd}`] };
  }
  if (policy.allowLimitResidual) {
    return { decision: "LIMIT", venue: "FLASH", reasons: [...reasons, "price protection preferred; limit at snapshot reference less max slippage"] };
  }
  if (policy.allowMarketResidual && ctx.immediateCostBps !== undefined) {
    return { decision: "EXECUTE_NOW", venue: "UNISWAP", reasons: [...reasons, "only market execution allowed"] };
  }
  return park(policy, [...reasons, "no allowed execution style fits"]);
}

/**
 * US equity session for a timestamp, using US Eastern daylight time (UTC-4), which covers September 2026.
 * Regular 09:30-16:00, extended 04:00-09:30 and 16:00-20:00, overnight otherwise and on weekends.
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
