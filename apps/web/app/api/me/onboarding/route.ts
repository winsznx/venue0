import { body, route } from "@/lib/server/api";
import { completeOnboarding, type AgentMode } from "@/lib/server/users";

export const POST = route(async ({ session, request }) => {
  const { agentMode } = await body<{ agentMode: AgentMode }>(request);
  await completeOnboarding(session.address, agentMode === "NATURAL_LANGUAGE" ? "NATURAL_LANGUAGE" : "STRUCTURED");
  return { ok: true };
});
