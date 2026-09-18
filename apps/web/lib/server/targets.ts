import "server-only";
import type { Address } from "viem";
import { claudeInterpreter, planGoal, resolveGoal, type GoalPreview, type GoalSpec, type Problem, type ResolveContext } from "@venue0/agent";
import type { ExecutionPolicy, Holding } from "@venue0/portfolio";
import type { AssetUid } from "@venue0/shared";
import { env } from "./env";
import { livePricesBySymbol, loadPortfolio, universe } from "./portfolio";
import type { SavedTarget, TargetWeight } from "./users";

export type TargetRow = { uid: string; symbol: string; currentUsd: number; targetUsd: number; deltaUsd: number; currentPct: number; targetPct: number };

export type TargetCheck =
  | { ok: true; rows: TargetRow[]; weights: TargetWeight[]; totalUsd: number; cashTargetUsd: number; warnings: string[]; computedAt: string; spec: GoalSpec; source: "STRUCTURED" | "NATURAL_LANGUAGE" }
  | { ok: false; problems: Problem[]; spec?: GoalSpec; source: "STRUCTURED" | "NATURAL_LANGUAGE" | "NONE" };

const e18 = (v: bigint) => Number(v / 10n ** 12n) / 1e6;

function policy(target: Pick<SavedTarget, "maxExternalCostBps">): ExecutionPolicy {
  return { maxExternalSlippageBps: target.maxExternalCostBps, maxReferencePriceDriftBps: 100, maxRoundDurationSec: 900, allowPartialCross: true, allowMarketResidual: true, allowLimitResidual: true, allowTwapResidual: true, allowWaitResidual: true, urgency: "NORMAL", validUntil: Math.floor(Date.now() / 1000) + 3_600 };
}

/** Resolver context from a fresh server-side read of the wallet. Client-supplied balances are never used. */
async function context(address: Address, extraSymbols: readonly string[] = []): Promise<{ problem: Problem } | { ctx: ResolveContext }> {
  const portfolio = await loadPortfolio(address);
  if (!portfolio.ok) return { problem: { code: "NO_CHANGE", detail: `${portfolio.reason}: ${portfolio.detail}` } };
  if (portfolio.positions.length === 0) return { problem: { code: "NOT_HELD", detail: "This wallet holds no Stock Tokens on Robinhood Chain yet." } };
  const { registry } = await universe();
  const holdings: Holding[] = portfolio.positions.map((p) => ({ owner: portfolio.address, assetUid: p.uid as AssetUid, token: p.token, rawBalance: BigInt(p.rawBalance) }));
  const prices = new Map<AssetUid, bigint>(portfolio.positions.map((p) => [p.uid as AssetUid, BigInt(p.priceE18)]));
  const held = new Set(portfolio.positions.map((p) => p.symbol));
  const missing = extraSymbols.filter((s) => !held.has(s.trim().toUpperCase()));
  if (missing.length) for (const [uid, price] of await livePricesBySymbol(missing)) prices.set(uid as AssetUid, price);
  return { ctx: { owner: portfolio.address, holdings, registry, prices, nowSec: Math.floor(Date.now() / 1000), maxRegistryAgeSec: 3_600 } };
}

/**
 * Target weights in whole basis points that, with the cash weight, sum to exactly 10,000 (largest remainder), so a saved
 * target re-resolves to the same allocation instead of leaving a stray basis point unassigned.
 */
function basisPoints(preview: GoalPreview, total: bigint): TargetWeight[] {
  if (total === 0n) return preview.tokens.map((t) => ({ uid: t.uid, symbol: t.symbol, weightBps: 0 }));
  const cashBps = Number((preview.cashTargetUsdE18 * 10_000n + total / 2n) / total);
  const exact = preview.tokens.map((t) => ({ t, scaled: t.targetUsdE18 * 10_000n }));
  const weights = exact.map(({ t, scaled }) => ({ uid: t.uid, symbol: t.symbol, weightBps: Number(scaled / total), rem: scaled % total }));
  let missing = 10_000 - cashBps - weights.reduce((s, w) => s + w.weightBps, 0);
  for (const w of [...weights].sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : 0))) {
    if (missing <= 0) break;
    if (w.weightBps === 0 && w.rem === 0n) continue;
    w.weightBps += 1;
    missing -= 1;
  }
  return weights.map(({ uid, symbol, weightBps }) => ({ uid, symbol, weightBps }));
}

function shape(preview: GoalPreview, source: "STRUCTURED" | "NATURAL_LANGUAGE"): TargetCheck {
  const total = preview.rebalance.totalValueUsdE18;
  const pct = (v: bigint) => (total > 0n ? Number((v * 1_000_000n) / total) / 10_000 : 0);
  const rows = preview.tokens.map((t) => ({ uid: t.uid, symbol: t.symbol, currentUsd: e18(t.currentUsdE18), targetUsd: e18(t.targetUsdE18), deltaUsd: e18(t.deltaUsdE18), currentPct: pct(t.currentUsdE18), targetPct: pct(t.targetUsdE18) }));
  return {
    ok: true,
    rows,
    weights: basisPoints(preview, total),
    totalUsd: e18(total),
    cashTargetUsd: e18(preview.cashTargetUsdE18),
    warnings: preview.warnings,
    computedAt: new Date().toISOString(),
    spec: preview.spec,
    source,
  };
}

export function specFromTarget(target: Omit<SavedTarget, "updatedAt">): GoalSpec {
  return {
    operations: target.weights.map((w) => ({ op: "SET_WEIGHT" as const, symbol: w.symbol.trim().toUpperCase(), weightPct: w.weightBps / 100, from: null, to: null, fraction: null })),
    remainderTo: null,
    cashWeightPct: target.cashBps > 0 ? target.cashBps / 100 : null,
    constraints: { maxExternalSlippageBps: target.maxExternalCostBps, allowMarketResidual: target.residualStyle === "ANY" ? null : false, residualStyle: target.residualStyle === "ANY" ? null : target.residualStyle, twapDurationSec: target.residualStyle === "TWAP" ? 7_200 : null, urgency: null, crossAsMuchAsPossible: true },
    circleName: null,
    roundTiming: null,
    clarificationsNeeded: [],
  };
}

/** Structured mode: the same deterministic resolver the agent uses, fed explicit weights. */
export async function validateTarget(address: Address, target: Omit<SavedTarget, "updatedAt">): Promise<TargetCheck> {
  const c = await context(address, target.weights.map((w) => w.symbol));
  if ("problem" in c) return { ok: false, problems: [c.problem], source: "NONE" };
  const result = resolveGoal(specFromTarget(target), c.ctx, policy(target));
  return result.ok ? shape(result.preview, target.source) : { ok: false, problems: result.problems, source: target.source };
}

/** Natural-language mode. Without an Anthropic credential nothing is sent anywhere and the user is pointed to structured mode. */
export async function interpretToTarget(address: Address, instruction: string): Promise<TargetCheck> {
  if (!env.anthropicAvailable) return { ok: false, source: "NONE", problems: [{ code: "CLARIFICATION_NEEDED", detail: "The language agent is not configured on this server. Set weights directly instead; the same checks apply." }] };
  if (instruction.trim().length < 4) return { ok: false, source: "NONE", problems: [{ code: "NO_CHANGE", detail: "Describe the change you want." }] };
  const { registry } = await universe();
  const mentioned = registry.all().map((t) => t.symbol).filter((sym) => new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(instruction));
  const c = await context(address, mentioned);
  if ("problem" in c) return { ok: false, problems: [c.problem], source: "NONE" };
  try {
    const { spec, result } = await planGoal(instruction.slice(0, 1_000), claudeInterpreter(), c.ctx, policy({ maxExternalCostBps: 50 }));
    return result.ok ? shape(result.preview, "NATURAL_LANGUAGE") : { ok: false, problems: result.problems, spec, source: "NATURAL_LANGUAGE" };
  } catch (error) {
    return { ok: false, source: "NATURAL_LANGUAGE", problems: [{ code: "CLARIFICATION_NEEDED", detail: `The agent could not interpret this: ${(error as Error).message}` }] };
  }
}
