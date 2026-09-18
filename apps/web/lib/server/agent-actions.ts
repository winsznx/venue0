"use server";

import type { Address } from "viem";
import { claudeInterpreter, planGoal, resolveGoal, type GoalSpec, type Problem, type ResolveContext } from "@venue0/agent";
import type { ExecutionPolicy, Holding } from "@venue0/portfolio";
import type { AssetUid } from "@venue0/shared";
import { env } from "./env";
import { loadPortfolio, universe } from "./portfolio";

export type PreviewRow = { symbol: string; currentUsd: number; targetUsd: number; deltaUsd: number };
export type PreviewResult =
  | { ok: true; source: "MODEL" | "STRUCTURED"; spec: GoalSpec; rows: PreviewRow[]; totalUsd: number; cashTargetUsd: number; warnings: string[]; limits: Array<{ symbol: string; side: "SELL" | "BUY"; amountTokens: number }>; policy: ExecutionPolicy; computedAt: string }
  | { ok: false; source: "MODEL" | "STRUCTURED" | "NONE"; spec?: GoalSpec; problems: Problem[] };

const e18 = (v: bigint) => Number(v / 10n ** 12n) / 1e6;

function basePolicy(): ExecutionPolicy {
  return { maxExternalSlippageBps: 50, maxReferencePriceDriftBps: 100, maxRoundDurationSec: 900, allowPartialCross: true, allowMarketResidual: true, allowLimitResidual: true, allowTwapResidual: true, allowWaitResidual: true, urgency: "NORMAL", validUntil: Math.floor(Date.now() / 1000) + 3_600 };
}

/** Builds the resolver context from a fresh server-side read. Client-supplied balances are never used. */
async function context(address: string): Promise<{ error: Problem } | { ctx: ResolveContext }> {
  const portfolio = await loadPortfolio(address);
  if (!portfolio.ok) return { error: { code: "NO_CHANGE", detail: `${portfolio.reason}: ${portfolio.detail}` } };
  const { registry } = await universe();
  const holdings: Holding[] = portfolio.positions.map((p) => ({ owner: portfolio.address, assetUid: p.uid as AssetUid, token: p.token, rawBalance: BigInt(p.rawBalance) }));
  const prices = new Map<AssetUid, bigint>(portfolio.positions.map((p) => [p.uid as AssetUid, BigInt(p.priceE18)]));
  return { ctx: { owner: portfolio.address as Address, holdings, registry, prices, nowSec: Math.floor(Date.now() / 1000), maxRegistryAgeSec: 3_600 } };
}

function shape(result: ReturnType<typeof resolveGoal>, source: "MODEL" | "STRUCTURED", spec: GoalSpec): PreviewResult {
  if (!result.ok) return { ok: false, source, spec, problems: result.problems };
  const p = result.preview;
  const symbolOf = new Map(p.tokens.map((t) => [t.uid, t.symbol]));
  return {
    ok: true,
    source,
    spec,
    rows: p.tokens.map((t) => ({ symbol: t.symbol, currentUsd: e18(t.currentUsdE18), targetUsd: e18(t.targetUsdE18), deltaUsd: e18(t.deltaUsdE18) })),
    totalUsd: e18(p.rebalance.totalValueUsdE18),
    cashTargetUsd: e18(p.cashTargetUsdE18),
    warnings: p.warnings,
    limits: p.limits.map((l) => ({ symbol: symbolOf.get(l.assetUid) ?? "?", side: l.maxOutRaw > 0n ? "SELL" : "BUY", amountTokens: Number((l.maxOutRaw + l.maxInRaw) / 10n ** 9n) / 1e9 })),
    policy: p.policy,
    computedAt: new Date().toISOString(),
  };
}

export async function interpretInstruction(address: string, instruction: string): Promise<PreviewResult> {
  if (!env.anthropicAvailable) return { ok: false, source: "NONE", problems: [{ code: "CLARIFICATION_NEEDED", detail: "Live agent unavailable: no Anthropic credential is configured. Use structured target mode." }] };
  if (instruction.trim().length < 4) return { ok: false, source: "NONE", problems: [{ code: "NO_CHANGE", detail: "Describe the change you want." }] };
  const c = await context(address);
  if ("error" in c) return { ok: false, source: "NONE", problems: [c.error] };
  try {
    const { spec, result } = await planGoal(instruction.slice(0, 1_000), claudeInterpreter(), c.ctx, basePolicy());
    return shape(result, "MODEL", spec);
  } catch (error) {
    return { ok: false, source: "MODEL", problems: [{ code: "CLARIFICATION_NEEDED", detail: `The agent could not interpret this: ${(error as Error).message}` }] };
  }
}

export async function previewStructured(address: string, spec: GoalSpec): Promise<PreviewResult> {
  const c = await context(address);
  if ("error" in c) return { ok: false, source: "NONE", problems: [c.error] };
  return shape(resolveGoal(spec, c.ctx, basePolicy()), "STRUCTURED", spec);
}
