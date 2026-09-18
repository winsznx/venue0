import { body, route } from "@/lib/server/api";
import { validateTarget } from "@/lib/server/targets";
import { getTarget, saveTarget, type SavedTarget } from "@/lib/server/users";

export const GET = route(async ({ session }) => ({ target: (await getTarget(session.address)) ?? null }));

/** Saves a target only after the deterministic resolver accepts it against the wallet's live holdings. */
export const POST = route(async ({ session, request }) => {
  const input = await body<Omit<SavedTarget, "updatedAt">>(request);
  const check = await validateTarget(session.address, input);
  if (!check.ok) return { ok: false, problems: check.problems };
  await saveTarget(session.address, { ...input, weights: check.weights });
  return { ok: true, target: await getTarget(session.address) };
});
