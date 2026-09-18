import { describe, expect, it } from "vitest";
import { parseTradingCapabilities } from "@venue0/assets";
import { decideResidual, routeCost, usEquitySession, type ResidualContext, type ResidualPolicy, type RouteCostEstimate } from "../src/index.ts";

const TRADABLE = parseTradingCapabilities({
  market: { whole: "TRADING_STATUS_TRADABLE", fractional: "TRADING_STATUS_TRADABLE" },
  extended: { whole: "TRADING_STATUS_TRADABLE", fractional: "TRADING_STATUS_TRADABLE" },
  overnight: { whole: "TRADING_STATUS_TRADABLE", fractional: "TRADING_STATUS_UNTRADABLE" },
});

const policy: ResidualPolicy = {
  urgency: "NORMAL",
  maxExternalSlippageBps: 50,
  maxReferencePriceDriftBps: 100,
  allowMarketResidual: true,
  allowLimitResidual: true,
  allowTwapResidual: true,
  allowWaitResidual: true,
};

const at = "2026-09-18T12:57:00Z";

/** Uniswap: pool fee and impact are inside the quote; gas is separate and fixed. */
function uniswap(notional: number, lossBps: number, gasUsd = 0.02): RouteCostEstimate {
  return routeCost({ venue: "UNISWAP", style: "MARKET", referenceInUsd: notional, referenceOutUsd: notional * (1 - lossBps / 10_000), providerFeeUsd: null, networkCostUsd: gasUsd, fixedCostUsd: gasUsd, source: "test", observedAt: at });
}

/** Flash: flat fee (network + trade) deducted from input, plus traded-price impact. */
function flash(style: "LIMIT" | "TWAP" | "MARKET", notional: number, flatFeeUsd: number, impactBps = 5): RouteCostEstimate {
  const fee = flatFeeUsd + notional * 0.001;
  return routeCost({ venue: "FLASH", style, referenceInUsd: notional, referenceOutUsd: notional - fee - (notional * impactBps) / 10_000, providerFeeUsd: fee, networkCostUsd: null, fixedCostUsd: flatFeeUsd, source: "test", observedAt: at });
}

function ctx(notional: number, routes: RouteCostEstimate[], overrides: Partial<ResidualContext> = {}): ResidualContext {
  return { notionalUsd: notional, session: "market", capabilities: TRADABLE, tradingHalt: false, referenceDriftBps: 10, routes, twapThresholdUsd: 5_000, nextRoundAvailable: true, ...overrides };
}

describe("decideResidual economics", () => {
  it("does not route the observed $1.20 residual to Flash when the flat fee dominates", () => {
    // Replays L6: $1.199 residual, $0.1617 network + $0.0012 trade fee observed on 2026-09-18.
    const plan = decideResidual({ ...policy, allowMarketResidual: false, urgency: "LOW" }, ctx(1.199429, [flash("LIMIT", 1.199429, 0.1617)]));
    expect(plan.decision).toBe("AGGREGATE");
    expect(plan.route).toBeNull();
    const evaluated = plan.evaluated[0];
    expect(evaluated?.allInCostBps).toBeGreaterThan(1_300);
    expect(evaluated?.viable).toBe(false);
    expect(plan.reasons.join(" ")).toMatch(/fixed cost .* dominates/);
  });

  it("waits instead of aggregating when no later round exists", () => {
    const plan = decideResidual({ ...policy, allowMarketResidual: false }, ctx(1.2, [flash("LIMIT", 1.2, 0.1617)], { nextRoundAvailable: false }));
    expect(plan.decision).toBe("WAIT");
  });

  it("cancels an uneconomic residual when the user allows neither waiting nor aggregation", () => {
    const plan = decideResidual({ ...policy, allowWaitResidual: false, allowMarketResidual: false }, ctx(1.2, [flash("LIMIT", 1.2, 0.1617)]));
    expect(plan.decision).toBe("CANCEL");
  });

  it("prefers a cheaper immediate route over Flash for a small residual", () => {
    const plan = decideResidual(policy, ctx(20, [uniswap(20, 30), flash("LIMIT", 20, 0.1617)]));
    expect(plan.decision).toBe("EXECUTE_NOW");
    expect(plan.route?.venue).toBe("UNISWAP");
  });

  it("uses Flash LIMIT once the fee is small relative to size and cheaper than the market", () => {
    const plan = decideResidual(policy, ctx(400, [uniswap(400, 60), flash("LIMIT", 400, 0.1617)]));
    expect(plan.decision).toBe("LIMIT");
    expect(plan.route?.venue).toBe("FLASH");
    expect(plan.route?.allInCostBps).toBeLessThanOrEqual(50);
  });

  it("slices large residuals with TWAP when it is the cheapest viable route", () => {
    const plan = decideResidual(policy, ctx(20_000, [uniswap(20_000, 80), flash("LIMIT", 20_000, 0.33, 45), flash("TWAP", 20_000, 0.33, 15)]));
    expect(plan.decision).toBe("TWAP");
  });

  it("never chooses TWAP below the size threshold", () => {
    const plan = decideResidual(policy, ctx(500, [flash("TWAP", 500, 0.33, 5)]));
    expect(plan.decision).not.toBe("TWAP");
  });

  it("urgent residuals take a viable market route even if a limit is cheaper", () => {
    const plan = decideResidual({ ...policy, urgency: "HIGH" }, ctx(400, [uniswap(400, 40), flash("LIMIT", 400, 0.1617)]));
    expect(plan.decision).toBe("EXECUTE_NOW");
  });

  it("waits when every route is too expensive for reasons other than fixed cost", () => {
    const plan = decideResidual(policy, ctx(1_000, [uniswap(1_000, 300)]));
    expect(plan.decision).toBe("WAIT");
  });

  it("parks during a halt, a closed session, or excessive drift", () => {
    const routes = [uniswap(500, 20)];
    expect(decideResidual(policy, ctx(500, routes, { tradingHalt: true })).decision).toBe("WAIT");
    expect(decideResidual(policy, ctx(500, routes, { session: "overnight" })).decision).toBe("WAIT");
    expect(decideResidual(policy, ctx(500, routes, { referenceDriftBps: 250 })).decision).toBe("WAIT");
  });

  it("parks when no route exists", () => {
    const plan = decideResidual(policy, ctx(500, []));
    expect(plan.decision).toBe("WAIT");
    expect(plan.reasons.join(" ")).toMatch(/no external route/);
  });

  it("finds the size where Flash becomes viable under a 50 bps cap", () => {
    const viableAt = [5, 10, 25, 50, 100, 250, 500].find((n) => decideResidual({ ...policy, allowMarketResidual: false }, ctx(n, [flash("LIMIT", n, 0.1617)])).decision === "LIMIT");
    expect(viableAt).toBe(50);
  });
});

describe("usEquitySession", () => {
  it("maps Eastern daylight time to sessions", () => {
    expect(usEquitySession(new Date("2026-09-18T12:57:00Z"))).toBe("extended");
    expect(usEquitySession(new Date("2026-09-18T14:00:00Z"))).toBe("market");
    expect(usEquitySession(new Date("2026-09-18T03:00:00Z"))).toBe("overnight");
    expect(usEquitySession(new Date("2026-09-19T15:00:00Z"))).toBe("overnight");
  });
});
