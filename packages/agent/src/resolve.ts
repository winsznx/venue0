import { valueUsdE18, type CanonicalStockToken, type StockTokenRegistry } from "@venue0/assets";
import {
  computeRebalance,
  deltaLimits,
  hashPolicy,
  type AssetDeltaLimit,
  type ExecutionPolicy,
  type Holding,
  type PortfolioIntent,
  type RebalancePlan,
} from "@venue0/portfolio";
import { BPS, mulDivDown, type Address, type AssetUid, type Hex } from "@venue0/shared";
import type { GoalSpec, Operation } from "./goal.ts";

export type ProblemCode =
  | "CLARIFICATION_NEEDED"
  | "AMBIGUOUS_TICKER"
  | "UNSUPPORTED_TOKEN"
  | "WEIGHTS_EXCEED_100"
  | "IMPOSSIBLE_ALLOCATION"
  | "CONFLICTING_CONSTRAINTS"
  | "NOT_HELD"
  | "NO_SAVED_TARGET"
  | "INVALID_OPERATION"
  | "STALE_METADATA"
  | "PENDING_CORPORATE_ACTION"
  | "NO_CHANGE";

export type Problem = { code: ProblemCode; detail: string };

/** Words users say for cash. They are never Stock Tokens; the model is told to use cashWeightPct instead. */
const CASH_WORDS = new Set(["USDG", "USD", "CASH", "USDC"]);

export type ResolveContext = {
  owner: Address;
  holdings: Holding[];
  registry: StockTokenRegistry;
  prices: ReadonlyMap<AssetUid, bigint>;
  /** Saved target weights in bps by asset uid (needed for overweight and "join with my plan"). */
  savedTargetBps?: ReadonlyMap<AssetUid, number>;
  nowSec: number;
  maxRegistryAgeSec: number;
};

export type GoalPreview = {
  owner: Address;
  spec: GoalSpec;
  rebalance: RebalancePlan;
  /** Stock Token portion only. The cash leg is not crossable in V1 and is shown as an external residual. */
  cashTargetUsdE18: bigint;
  tokens: Array<{ uid: AssetUid; symbol: string; address: Address; currentUsdE18: bigint; targetUsdE18: bigint; deltaUsdE18: bigint }>;
  limits: AssetDeltaLimit[];
  policy: ExecutionPolicy;
  warnings: string[];
};

export type ResolveResult = { ok: true; preview: GoalPreview } | { ok: false; problems: Problem[] };

/**
 * Turns the model's structured reading into exact targets. Every ticker goes through the canonical registry; every number
 * the user sees is computed here from the snapshot, never taken from the model.
 */
export function resolveGoal(spec: GoalSpec, ctx: ResolveContext, basePolicy: ExecutionPolicy): ResolveResult {
  const problems: Problem[] = [];
  const warnings: string[] = [];
  for (const c of spec.clarificationsNeeded) problems.push({ code: "CLARIFICATION_NEEDED", detail: c });

  const ageSec = ctx.nowSec - Math.floor(Date.parse(ctx.registry.resolvedAt) / 1000);
  if (ageSec > ctx.maxRegistryAgeSec) problems.push({ code: "STALE_METADATA", detail: `asset registry is ${ageSec}s old (max ${ctx.maxRegistryAgeSec}s); refresh before building an intent` });

  const resolve = (ticker: string | null, role: string): CanonicalStockToken | undefined => {
    if (!ticker) {
      problems.push({ code: "INVALID_OPERATION", detail: `${role} ticker missing` });
      return undefined;
    }
    if (CASH_WORDS.has(ticker.toUpperCase())) {
      problems.push({ code: "UNSUPPORTED_TOKEN", detail: `${ticker} is cash, not a Stock Token; express it as a cash weight` });
      return undefined;
    }
    try {
      const token = ctx.registry.resolveSymbol(ticker);
      if (token.pendingMultiplier) problems.push({ code: "PENDING_CORPORATE_ACTION", detail: `${token.symbol} has a pending multiplier change (${token.pendingMultiplier}); wait until it takes effect` });
      return token;
    } catch (error) {
      const message = (error as Error).message;
      problems.push(/resolves to [2-9]/.test(message)
        ? { code: "AMBIGUOUS_TICKER", detail: `${ticker} matches more than one canonical Stock Token; pick one by contract address` }
        : { code: "UNSUPPORTED_TOKEN", detail: `${ticker} is not a canonical Robinhood Stock Token on Robinhood Chain` });
      return undefined;
    }
  };

  // Current values.
  const current = new Map<AssetUid, bigint>();
  for (const h of ctx.holdings) current.set(h.assetUid, valueUsdE18(h.rawBalance, ctx.prices.get(h.assetUid) ?? 0n));
  const total = [...current.values()].reduce((a, b) => a + b, 0n);
  if (total === 0n) problems.push({ code: "NOT_HELD", detail: "no Stock Token holdings to rebalance" });

  // Constraint consistency.
  const k = spec.constraints;
  if (k.maxExternalSlippageBps !== null && (k.maxExternalSlippageBps < 0 || k.maxExternalSlippageBps > 2_000)) problems.push({ code: "CONFLICTING_CONSTRAINTS", detail: `max external cost ${k.maxExternalSlippageBps} bps is out of range` });
  if (k.residualStyle === "TWAP" && k.urgency === "HIGH") problems.push({ code: "CONFLICTING_CONSTRAINTS", detail: "TWAP residuals cannot also be HIGH urgency" });
  if (k.residualStyle === "WAIT" && k.urgency === "HIGH") problems.push({ code: "CONFLICTING_CONSTRAINTS", detail: "waiting on residuals conflicts with HIGH urgency" });
  if (k.twapDurationSec !== null && k.twapDurationSec < 300) problems.push({ code: "CONFLICTING_CONSTRAINTS", detail: "TWAP duration must be at least 300 seconds" });
  if (spec.cashWeightPct !== null && (spec.cashWeightPct < 0 || spec.cashWeightPct >= 100)) problems.push({ code: "IMPOSSIBLE_ALLOCATION", detail: `cash weight ${spec.cashWeightPct}% is impossible` });

  const touched = new Map<AssetUid, string>();
  const noteTouch = (uid: AssetUid, op: string) => {
    const prior = touched.get(uid);
    if (prior && prior !== op) problems.push({ code: "CONFLICTING_CONSTRAINTS", detail: `one asset is both ${prior} and ${op}` });
    touched.set(uid, op);
  };

  const target = new Map(current);
  let setWeightBps = 0;
  const explicit = new Set<AssetUid>();
  const pct = (p: number) => Math.round(p * 100);

  const ops: Operation[] = spec.operations;
  if (ops.length === 0 && problems.length === 0) problems.push({ code: "NO_CHANGE", detail: "the instruction contains no portfolio change" });

  for (const op of ops) {
    if (op.op === "USE_SAVED_TARGET") {
      if (!ctx.savedTargetBps || ctx.savedTargetBps.size === 0) {
        problems.push({ code: "NO_SAVED_TARGET", detail: "no saved target to join the round with; state the change you want" });
        continue;
      }
      for (const uid of new Set([...target.keys(), ...ctx.savedTargetBps.keys()])) target.set(uid, mulDivDown(total, BigInt(ctx.savedTargetBps.get(uid) ?? 0), BPS));
      continue;
    }
    if (op.op === "SET_WEIGHT") {
      const token = resolve(op.symbol, "SET_WEIGHT");
      if (!token || op.weightPct === null) continue;
      if (op.weightPct < 0 || op.weightPct > 100) {
        problems.push({ code: "IMPOSSIBLE_ALLOCATION", detail: `${token.symbol} weight ${op.weightPct}%` });
        continue;
      }
      noteTouch(token.uid, "SET_WEIGHT");
      explicit.add(token.uid);
      setWeightBps += pct(op.weightPct);
      target.set(token.uid, mulDivDown(total, BigInt(pct(op.weightPct)), BPS));
      continue;
    }
    const from = resolve(op.from, "source");
    const to = resolve(op.to, "destination");
    if (!from || !to) continue;
    if (from.uid === to.uid) {
      problems.push({ code: "INVALID_OPERATION", detail: `cannot move ${from.symbol} into itself` });
      continue;
    }
    if (op.fraction === null || op.fraction <= 0 || op.fraction > 1) {
      problems.push({ code: "INVALID_OPERATION", detail: `fraction ${op.fraction} must be in (0, 1]` });
      continue;
    }
    const held = current.get(from.uid) ?? 0n;
    if (held === 0n) {
      problems.push({ code: "NOT_HELD", detail: `you hold no ${from.symbol}` });
      continue;
    }
    noteTouch(from.uid, "reduced");
    noteTouch(to.uid, "increased");
    let base = held;
    if (op.op === "MOVE_OVERWEIGHT_FRACTION") {
      const saved = ctx.savedTargetBps?.get(from.uid);
      if (saved === undefined) {
        problems.push({ code: "NO_SAVED_TARGET", detail: `no saved target weight for ${from.symbol}, so "overweight" is undefined` });
        continue;
      }
      base = held - mulDivDown(total, BigInt(saved), BPS);
      if (base <= 0n) {
        problems.push({ code: "IMPOSSIBLE_ALLOCATION", detail: `${from.symbol} is not overweight versus the saved target` });
        continue;
      }
    }
    const moved = mulDivDown(base, BigInt(Math.round(op.fraction * 1_000_000)), 1_000_000n);
    target.set(from.uid, (target.get(from.uid) ?? 0n) - moved);
    target.set(to.uid, (target.get(to.uid) ?? 0n) + moved);
  }

  if (setWeightBps + pct(spec.cashWeightPct ?? 0) > 10_000) problems.push({ code: "WEIGHTS_EXCEED_100", detail: `explicit weights and cash sum to ${(setWeightBps + pct(spec.cashWeightPct ?? 0)) / 100}%` });

  // Absorb the difference created by SET_WEIGHT: into remainderTo if named, else pro-rata across untouched holdings.
  const setSum = [...target.values()].reduce((a, b) => a + b, 0n);
  const gap = total - setSum;
  if (explicit.size > 0 && gap !== 0n) {
    if (spec.remainderTo) {
      const sink = resolve(spec.remainderTo, "remainder");
      if (sink) {
        if (explicit.has(sink.uid)) problems.push({ code: "CONFLICTING_CONSTRAINTS", detail: `${sink.symbol} has an explicit weight and also receives the remainder` });
        target.set(sink.uid, (target.get(sink.uid) ?? 0n) + gap);
      }
    } else {
      const pool = [...target.keys()].filter((uid) => !explicit.has(uid) && !touched.has(uid) && (current.get(uid) ?? 0n) > 0n);
      const poolValue = pool.reduce((a, uid) => a + (current.get(uid) ?? 0n), 0n);
      if (poolValue === 0n) problems.push({ code: "CLARIFICATION_NEEDED", detail: "where should the freed or missing weight go? name a ticker" });
      else for (const uid of pool) target.set(uid, (target.get(uid) ?? 0n) + (gap * (current.get(uid) ?? 0n)) / poolValue);
      if (poolValue > 0n) warnings.push("unassigned weight was spread pro-rata across holdings you did not mention");
    }
  }
  for (const [uid, v] of target) if (v < 0n) problems.push({ code: "IMPOSSIBLE_ALLOCATION", detail: `target for ${uid} would be negative` });

  // Cash floor scales the Stock Token targets; the cash leg itself must go external (asset-for-asset crossing in V1).
  const cashBps = BigInt(pct(spec.cashWeightPct ?? 0));
  const cashTarget = mulDivDown(total, cashBps, BPS);
  if (cashBps > 0n) {
    for (const [uid, v] of target) target.set(uid, mulDivDown(v, BPS - cashBps, BPS));
    warnings.push("the cash (USDG) portion cannot cross inside Venue0 in V1 and will be sold through the residual engine");
  }

  if (problems.length > 0) return { ok: false, problems };

  const tokenMap = new Map<AssetUid, Address>(ctx.registry.all().map((t) => [t.uid, t.contractAddress]));
  const rebalance = computeRebalance(
    ctx.holdings,
    { account: ctx.owner, targets: [...target].map(([uid, v]) => ({ assetUid: uid, targetValueUsdE18: v })) },
    ctx.prices,
    tokenMap,
  );
  const limits = deltaLimits(rebalance, ctx.prices, 10n ** 16n);
  const policy: ExecutionPolicy = {
    ...basePolicy,
    ...(k.maxExternalSlippageBps !== null ? { maxExternalSlippageBps: k.maxExternalSlippageBps } : {}),
    ...(k.allowMarketResidual !== null ? { allowMarketResidual: k.allowMarketResidual } : {}),
    ...(k.urgency !== null ? { urgency: k.urgency } : {}),
    ...(k.residualStyle === "TWAP" ? { allowTwapResidual: true, allowMarketResidual: false, ...(k.twapDurationSec !== null ? { maxTwapDurationSec: k.twapDurationSec } : {}) } : {}),
    ...(k.residualStyle === "LIMIT" ? { allowLimitResidual: true, allowMarketResidual: false } : {}),
    ...(k.residualStyle === "WAIT" ? { allowWaitResidual: true, allowMarketResidual: false } : {}),
    ...(k.crossAsMuchAsPossible ? { allowPartialCross: true } : {}),
  };
  const bySymbol = new Map(ctx.registry.all().map((t) => [t.uid, t]));
  return {
    ok: true,
    preview: {
      owner: ctx.owner,
      spec,
      rebalance,
      cashTargetUsdE18: cashTarget,
      tokens: rebalance.positions.map((p) => ({ uid: p.assetUid, symbol: bySymbol.get(p.assetUid)?.symbol ?? "?", address: p.token, currentUsdE18: p.valueUsdE18, targetUsdE18: p.targetValueUsdE18, deltaUsdE18: p.deltaValueUsdE18 })),
      limits,
      policy,
      warnings,
    },
  };
}

/** After the user approves the preview, builds the unsigned intent for a specific round. */
export function intentFromPreview(preview: GoalPreview, round: { circleId: Hex; roundId: Hex; valuationSnapshotHash: Hex; agent: Address; nonce: bigint; validAfter: number; validUntil: number }): PortfolioIntent {
  return {
    owner: preview.owner,
    agent: round.agent,
    circleId: round.circleId,
    roundId: round.roundId,
    valuationSnapshotHash: round.valuationSnapshotHash,
    policyHash: hashPolicy(preview.policy),
    policy: preview.policy,
    assets: preview.limits,
    nonce: round.nonce,
    validAfter: round.validAfter,
    validUntil: round.validUntil,
  };
}
