import { body, InputError, route } from "@/lib/server/api";
import { decide } from "@/lib/server/residuals";
import { getRound } from "@/lib/server/rounds";

export const POST = route(async ({ session, request, params }) => {
  const { choice, engineDecision } = await body<{ choice: string; engineDecision: string }>(request);
  if (choice !== "CARRY_FORWARD" && choice !== "CANCEL") throw new InputError("Choose carry forward or cancel.");
  await decide(await getRound(params.id as string), session.address, choice, engineDecision || "NONE");
  return { ok: true };
});
