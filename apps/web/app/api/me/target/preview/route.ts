import { body, route } from "@/lib/server/api";
import { interpretToTarget, validateTarget } from "@/lib/server/targets";
import type { SavedTarget } from "@/lib/server/users";

/** Structured mode checks weights; natural-language mode interprets text first. Neither saves anything. */
export const POST = route(async ({ session, request }) => {
  const input = await body<{ mode: "STRUCTURED"; target: Omit<SavedTarget, "updatedAt"> } | { mode: "NATURAL_LANGUAGE"; instruction: string }>(request);
  if (input.mode === "NATURAL_LANGUAGE") return interpretToTarget(session.address, input.instruction);
  return validateTarget(session.address, input.target);
});
