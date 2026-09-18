import type { ExecutionPolicy } from "@venue0/portfolio";
import type { GoalInterpreter } from "./interpreter.ts";
import { resolveGoal, type ResolveContext, type ResolveResult } from "./resolve.ts";
import type { GoalSpec } from "./goal.ts";

/** human instruction -> model interpretation (untrusted) -> deterministic resolution -> preview or problems. */
export async function planGoal(
  instruction: string,
  interpreter: GoalInterpreter,
  ctx: ResolveContext,
  basePolicy: ExecutionPolicy,
  circles: string[] = [],
): Promise<{ spec: GoalSpec; result: ResolveResult }> {
  const held = ctx.registry.all().filter((t) => ctx.holdings.some((h) => h.assetUid === t.uid && h.rawBalance > 0n)).map((t) => t.symbol);
  const spec = await interpreter(instruction, { heldSymbols: held, circles });
  return { spec, result: resolveGoal(spec, ctx, basePolicy) };
}
