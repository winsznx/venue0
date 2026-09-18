import type { Hex } from "viem";
import { body, route } from "@/lib/server/api";
import { approvalPayload, getRound, RoundError, submitApproval } from "@/lib/server/rounds";

export const GET = route(async ({ session, params }) => {
  const round = await getRound(params.id as string);
  if (!round.plan) throw new RoundError("This round has no plan to approve.");
  return approvalPayload(round.plan, session.address);
});

export const POST = route(async ({ session, request, params }) => {
  const { signature } = await body<{ signature: Hex }>(request);
  return { state: (await submitApproval(params.id as string, session.address, signature)).state };
});
