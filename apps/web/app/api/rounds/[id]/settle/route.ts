import type { Hex } from "viem";
import { body, route } from "@/lib/server/api";
import { getRound, recordSettlement, settleCall } from "@/lib/server/rounds";

/** GET returns the settle() call for the participant's wallet to send; POST reports the hash and verifies it onchain. */
export const GET = route(async ({ params }) => settleCall(await getRound(params.id as string)));

export const POST = route(async ({ session, request, params }) => {
  const { txHash } = await body<{ txHash: Hex }>(request);
  return { state: (await recordSettlement(params.id as string, session.address, txHash)).state };
});
