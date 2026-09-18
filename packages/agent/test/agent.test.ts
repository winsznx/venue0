import { describe, expect, it } from "vitest";
import raw from "../../../evidence/research/robinhood-assets-raw.json" with { type: "json" };
import { parseAssetsResponse, rawUnitsForValue, StockTokenRegistry, type ApiAsset } from "@venue0/assets";
import { intentProblems, type ExecutionPolicy, type Holding } from "@venue0/portfolio";
import { E18, type Address, type AssetUid, type Hex } from "@venue0/shared";
import { intentFromPreview, planGoal, resolveGoal, type GoalSpec, type ResolveContext } from "../src/index.ts";

const OWNER = "0x00000000000000000000000000000000000a1ce0" as Address;
const RESOLVED_AT = raw.capturedAt;
const NOW = Math.floor(Date.parse(RESOLVED_AT) / 1000) + 60;
const PRICE: Record<string, bigint> = { NVDA: 200n * E18, AAPL: 300n * E18, SPY: 750n * E18, QQQ: 700n * E18, TSLA: 400n * E18 };

function registry(mutate: (assets: ApiAsset[]) => ApiAsset[] = (a) => a) {
  return new StockTokenRegistry(mutate(parseAssetsResponse(raw.response).valid), RESOLVED_AT);
}

function context(holdingsUsd: Record<string, number>, reg = registry(), extra: Partial<ResolveContext> = {}): ResolveContext {
  const prices = new Map<AssetUid, bigint>(reg.all().filter((t) => PRICE[t.symbol] !== undefined).map((t) => [t.uid, PRICE[t.symbol] as bigint]));
  const holdings: Holding[] = Object.entries(holdingsUsd).map(([s, usd]) => {
    const t = reg.resolveSymbol(s);
    return { owner: OWNER, assetUid: t.uid, token: t.contractAddress, rawBalance: rawUnitsForValue(BigInt(usd) * E18, PRICE[s] as bigint) };
  });
  return { owner: OWNER, holdings, registry: reg, prices, nowSec: NOW, maxRegistryAgeSec: 3_600, ...extra };
}

const POLICY: ExecutionPolicy = { maxExternalSlippageBps: 50, maxReferencePriceDriftBps: 100, maxRoundDurationSec: 900, allowPartialCross: true, allowMarketResidual: true, allowLimitResidual: true, allowTwapResidual: true, allowWaitResidual: true, urgency: "NORMAL", validUntil: NOW + 3_600 };

const NONE = { maxExternalSlippageBps: null, allowMarketResidual: null, residualStyle: null, twapDurationSec: null, urgency: null, crossAsMuchAsPossible: null };
function spec(partial: Partial<GoalSpec>): GoalSpec {
  return { operations: [], remainderTo: null, cashWeightPct: null, constraints: NONE, circleName: null, roundTiming: null, clarificationsNeeded: [], ...partial };
}
const setWeight = (symbol: string, weightPct: number) => ({ op: "SET_WEIGHT" as const, symbol, weightPct, from: null, to: null, fraction: null });
const move = (op: "MOVE_POSITION_FRACTION" | "MOVE_OVERWEIGHT_FRACTION", from: string, to: string, fraction: number) => ({ op, symbol: null, weightPct: null, from, to, fraction });
const usd = (x: bigint) => Math.round(Number(x / 10n ** 14n) / 100) / 100;
const targetOf = (result: ReturnType<typeof resolveGoal>, symbol: string) => (result.ok ? usd(result.preview.tokens.find((t) => t.symbol === symbol)?.targetUsdE18 ?? 0n) : NaN);
const codes = (result: ReturnType<typeof resolveGoal>) => (result.ok ? [] : result.problems.map((p) => p.code));

describe("PRD example goals", () => {
  it('"Reduce my NVDA exposure to 20%, put the difference into SPY, and keep 10% in USDG."', () => {
    // #given $600 NVDA, $200 SPY, $200 AAPL
    const result = resolveGoal(spec({ operations: [setWeight("NVDA", 20)], remainderTo: "SPY", cashWeightPct: 10 }), context({ NVDA: 600, SPY: 200, AAPL: 200 }), POLICY);
    // #then Stock Token targets scale to 90%, cash target is 10%, and the cash leg is flagged as external
    expect(result.ok).toBe(true);
    expect([targetOf(result, "NVDA"), targetOf(result, "SPY"), targetOf(result, "AAPL")]).toEqual([180, 540, 180]);
    if (result.ok) {
      expect(usd(result.preview.cashTargetUsdE18)).toBe(100);
      expect(result.preview.warnings.join(" ")).toMatch(/cash \(USDG\) portion cannot cross/);
    }
  });

  it('"Move half of my AAPL overweight into QQQ but do not hit the market if the external spread is above 40 bps."', () => {
    const reg = registry();
    const ctx = context({ AAPL: 600, QQQ: 400 }, reg, { savedTargetBps: new Map([[reg.resolveSymbol("AAPL").uid, 3_000], [reg.resolveSymbol("QQQ").uid, 7_000]]) });
    const result = resolveGoal(spec({ operations: [move("MOVE_OVERWEIGHT_FRACTION", "AAPL", "QQQ", 0.5)], constraints: { ...NONE, maxExternalSlippageBps: 40 } }), ctx, POLICY);
    // AAPL is $300 over its 30% saved weight; half of that ($150) moves.
    expect([targetOf(result, "AAPL"), targetOf(result, "QQQ")]).toEqual([450, 550]);
    expect(result.ok && result.preview.policy.maxExternalSlippageBps).toBe(40);
  });

  it('"Join tonight\'s AI Stocks Circle round. Cross as much as possible. TWAP any residual over two hours."', () => {
    const reg = registry();
    const ctx = context({ NVDA: 500, SPY: 500 }, reg, { savedTargetBps: new Map([[reg.resolveSymbol("NVDA").uid, 4_000], [reg.resolveSymbol("SPY").uid, 6_000]]) });
    const result = resolveGoal(spec({ operations: [{ op: "USE_SAVED_TARGET", symbol: null, weightPct: null, from: null, to: null, fraction: null }], circleName: "AI Stocks Circle", roundTiming: "tonight", constraints: { ...NONE, residualStyle: "TWAP", twapDurationSec: 7_200, crossAsMuchAsPossible: true } }), ctx, POLICY);
    expect([targetOf(result, "NVDA"), targetOf(result, "SPY")]).toEqual([400, 600]);
    expect(result.ok && result.preview.policy).toMatchObject({ allowMarketResidual: false, allowTwapResidual: true, maxTwapDurationSec: 7_200, allowPartialCross: true });
  });

  it("produces an intent the matcher accepts, using canonical addresses from the registry", () => {
    const ctx = context({ NVDA: 600, SPY: 400 });
    const result = resolveGoal(spec({ operations: [setWeight("NVDA", 30)], remainderTo: "SPY" }), ctx, POLICY);
    if (!result.ok) throw new Error("expected ok");
    const round = { circleId: `0x${"11".repeat(32)}` as Hex, roundId: `0x${"22".repeat(32)}` as Hex, valuationSnapshotHash: `0x${"33".repeat(32)}` as Hex, agent: OWNER, nonce: 1n, validAfter: NOW - 60, validUntil: NOW + 600 };
    const intent = intentFromPreview(result.preview, round);
    const known = new Map(ctx.registry.all().map((t) => [t.uid, t.contractAddress]));
    expect(intentProblems(intent, { roundId: round.roundId, valuationSnapshotHash: round.valuationSnapshotHash, nowSec: NOW, knownTokens: known })).toEqual([]);
    expect(intent.assets.map((a) => a.token)).toContain(ctx.registry.resolveSymbol("NVDA").contractAddress);
  });
});

describe("explicit full allocation", () => {
  it("accepts weights that cover every holding at exactly 100% despite flooring", () => {
    // #given a portfolio whose raw balances floor to fractions of a cent
    const ctx = context({ AAPL: 276, SPY: 99 });
    // #when both holdings are set explicitly to 50%
    const result = resolveGoal(spec({ operations: [setWeight("AAPL", 50), setWeight("SPY", 50)] }), ctx, POLICY);
    // #then the target is valid and no remainder question is asked
    expect(result.ok).toBe(true);
  });
});

describe("adversarial goals are refused, not guessed", () => {
  it("ambiguous ticker", () => {
    const reg = registry((assets) => {
      const nvda = assets.find((a) => a.tokenSymbol === "NVDA") as ApiAsset;
      return [...assets, { ...nvda, id: `0x${"ab".repeat(32)}`, deployments: [{ contractAddress: "0x1111111111111111111111111111111111111111", chainId: 4663 }] }];
    });
    const ctx = context({ SPY: 500 }, reg);
    expect(codes(resolveGoal(spec({ operations: [move("MOVE_POSITION_FRACTION", "SPY", "NVDA", 0.5)] }), ctx, POLICY))).toContain("AMBIGUOUS_TICKER");
  });

  it("unsupported token and cash-as-ticker", () => {
    const ctx = context({ NVDA: 500, SPY: 500 });
    expect(codes(resolveGoal(spec({ operations: [move("MOVE_POSITION_FRACTION", "NVDA", "DOGE", 0.5)] }), ctx, POLICY))).toContain("UNSUPPORTED_TOKEN");
    expect(codes(resolveGoal(spec({ operations: [move("MOVE_POSITION_FRACTION", "NVDA", "USDG", 0.5)] }), ctx, POLICY))).toContain("UNSUPPORTED_TOKEN");
  });

  it("target weights above 100%", () => {
    const ctx = context({ NVDA: 500, SPY: 500 });
    expect(codes(resolveGoal(spec({ operations: [setWeight("NVDA", 70), setWeight("SPY", 50)] }), ctx, POLICY))).toContain("WEIGHTS_EXCEED_100");
    expect(codes(resolveGoal(spec({ operations: [setWeight("NVDA", 95)], remainderTo: "SPY", cashWeightPct: 10 }), ctx, POLICY))).toContain("WEIGHTS_EXCEED_100");
  });

  it("impossible allocation", () => {
    const ctx = context({ NVDA: 500, SPY: 500 });
    expect(codes(resolveGoal(spec({ operations: [setWeight("NVDA", 20)], remainderTo: "SPY", cashWeightPct: 100 }), ctx, POLICY))).toContain("IMPOSSIBLE_ALLOCATION");
    expect(codes(resolveGoal(spec({ operations: [setWeight("NVDA", 150)] }), ctx, POLICY))).toContain("IMPOSSIBLE_ALLOCATION");
  });

  it("conflicting constraints", () => {
    const ctx = context({ NVDA: 500, SPY: 500 });
    expect(codes(resolveGoal(spec({ operations: [setWeight("NVDA", 20)], remainderTo: "SPY", constraints: { ...NONE, residualStyle: "TWAP", urgency: "HIGH" } }), ctx, POLICY))).toContain("CONFLICTING_CONSTRAINTS");
    expect(codes(resolveGoal(spec({ operations: [setWeight("NVDA", 20), move("MOVE_POSITION_FRACTION", "SPY", "NVDA", 0.5)] }), ctx, POLICY))).toContain("CONFLICTING_CONSTRAINTS");
    expect(codes(resolveGoal(spec({ operations: [setWeight("NVDA", 20)], remainderTo: "NVDA" }), ctx, POLICY))).toContain("CONFLICTING_CONSTRAINTS");
  });

  it("request outside the user's holdings", () => {
    const ctx = context({ NVDA: 500, SPY: 500 });
    expect(codes(resolveGoal(spec({ operations: [move("MOVE_POSITION_FRACTION", "TSLA", "SPY", 1)] }), ctx, POLICY))).toContain("NOT_HELD");
  });

  it("stale asset metadata and pending corporate actions", () => {
    const stale = context({ NVDA: 500, SPY: 500 }, registry(), { nowSec: NOW + 7_200 });
    expect(codes(resolveGoal(spec({ operations: [setWeight("NVDA", 20)], remainderTo: "SPY" }), stale, POLICY))).toContain("STALE_METADATA");
    const pending = registry((assets) => assets.map((a) => (a.tokenSymbol === "NVDA" ? { ...a, pendingMultiplier: "2.000000000000000000" } : a)));
    expect(codes(resolveGoal(spec({ operations: [setWeight("NVDA", 20)], remainderTo: "SPY" }), context({ NVDA: 500, SPY: 500 }, pending), POLICY))).toContain("PENDING_CORPORATE_ACTION");
  });

  it("overweight without a saved target, and model-flagged ambiguity, block the intent", () => {
    const ctx = context({ AAPL: 600, QQQ: 400 });
    expect(codes(resolveGoal(spec({ operations: [move("MOVE_OVERWEIGHT_FRACTION", "AAPL", "QQQ", 0.5)] }), ctx, POLICY))).toContain("NO_SAVED_TARGET");
    expect(codes(resolveGoal(spec({ operations: [setWeight("AAPL", 20)], remainderTo: "QQQ", clarificationsNeeded: ["which Apple share class?"] }), ctx, POLICY))).toEqual(["CLARIFICATION_NEEDED"]);
  });

  it("an instruction with no change is not turned into a trade", () => {
    expect(codes(resolveGoal(spec({}), context({ NVDA: 500 }), POLICY))).toEqual(["NO_CHANGE"]);
  });
});

describe("planGoal", () => {
  it("passes only held tickers to the interpreter and never trusts its output unchecked", async () => {
    const ctx = context({ NVDA: 600, SPY: 400 });
    let seen: string[] = [];
    const interpreter = async (_text: string, c: { heldSymbols: string[] }) => {
      seen = c.heldSymbols;
      return spec({ operations: [setWeight("NVDX", 20)], remainderTo: "SPY" });
    };
    const { result } = await planGoal("reduce nvidia to 20%", interpreter, ctx, POLICY);
    expect(seen.sort()).toEqual(["NVDA", "SPY"]);
    expect(codes(result)).toContain("UNSUPPORTED_TOKEN");
  });
});
