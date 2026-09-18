import { body, InputError, route } from "@/lib/server/api";
import { updateSettings, type AgentMode, type ResidualPreference } from "@/lib/server/users";

const MODES: AgentMode[] = ["STRUCTURED", "NATURAL_LANGUAGE"];
const PREFS: ResidualPreference[] = ["ECONOMIC", "CARRY_FORWARD", "ASK_ME"];

export const POST = route(async ({ session, request }) => {
  const input = await body<{ agentMode: AgentMode; residualPreference: ResidualPreference }>(request);
  if (!MODES.includes(input.agentMode) || !PREFS.includes(input.residualPreference)) throw new InputError("Unknown agent mode or residual preference.");
  await updateSettings(session.address, input);
  return { ok: true };
});
