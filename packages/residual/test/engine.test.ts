import { describe, expect, it } from "vitest";
import { parseTradingCapabilities } from "@venue0/assets";
import { decideResidual, type ResidualContext, type ResidualPolicy } from "../src/index.ts";

const TRADABLE = parseTradingCapabilities({
  market: { whole: "TRADING_STATUS_TRADABLE", fractional: "TRADING_STATUS_TRADABLE" },
  extended: { whole: "TRADING_STATUS_TRADABLE", fractional: "TRADING_STATUS_TRADABLE" },
  overnight: { whole: "TRADING_STATUS_TRADABLE", fractional: "TRADING_STATUS_UNTRADABLE" },
});

const policy: ResidualPolicy = { urgency: "NORMAL", maxExternalSlippageBps: 50, maxReferencePriceDriftBps: 100, allowMarketResidual: true, allowLimitResidual: true, allowTwapResidual: true, allowWaitResidual: true };
const ctx: ResidualContext = { notionalUsd: 500, session: "market", capabilities: TRADABLE, tradingHalt: false, referenceDriftBps: 10, immediateCostBps: 30, advancedVenueAvailable: true, advancedCostBps: 20, twapThresholdUsd: 5_000 };

describe("decideResidual", () => {
  it("executes small cheap residuals immediately", () => {
    expect(decideResidual(policy, ctx)).toMatchObject({ decision: "EXECUTE_NOW", venue: "UNISWAP" });
  });
  it("slices large residuals with TWAP", () => {
    expect(decideResidual(policy, { ...ctx, notionalUsd: 20_000 })).toMatchObject({ decision: "TWAP", venue: "FLASH" });
  });
  it("uses a limit order when the market is too expensive", () => {
    expect(decideResidual(policy, { ...ctx, immediateCostBps: 120 })).toMatchObject({ decision: "LIMIT", venue: "FLASH" });
  });
  it("uses a limit order when the user refuses market residuals", () => {
    expect(decideResidual({ ...policy, allowMarketResidual: false }, ctx)).toMatchObject({ decision: "LIMIT" });
  });
  it("waits during a halt, a closed session, or excessive drift", () => {
    expect(decideResidual(policy, { ...ctx, tradingHalt: true }).decision).toBe("WAIT");
    expect(decideResidual(policy, { ...ctx, session: "overnight" }).decision).toBe("WAIT");
    expect(decideResidual(policy, { ...ctx, referenceDriftBps: 250 }).decision).toBe("WAIT");
  });
  it("cancels instead of waiting when the user disallows waiting", () => {
    expect(decideResidual({ ...policy, allowWaitResidual: false }, { ...ctx, tradingHalt: true }).decision).toBe("CANCEL");
  });
  it("waits when neither an immediate route nor an advanced venue exists", () => {
    const { immediateCostBps: _omit, ...noRoute } = ctx;
    const plan = decideResidual(policy, { ...noRoute, advancedVenueAvailable: false });
    expect(plan.decision).toBe("WAIT");
    expect(plan.reasons.join(" ")).toMatch(/no immediate route/);
  });
  it("urgent residuals go now even when large", () => {
    expect(decideResidual({ ...policy, urgency: "HIGH" }, { ...ctx, notionalUsd: 20_000 }).decision).toBe("EXECUTE_NOW");
  });
});
