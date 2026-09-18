import type { Hex } from "viem";
import type { PortfolioIntent } from "@venue0/portfolio";
import { body, route } from "@/lib/server/api";
import { getRound, intentSigningPayload, prepareIntent, submitIntent } from "@/lib/server/rounds";

/** GET builds the unsigned intent and its EIP-712 payload; POST accepts the wallet's signature over it. */
export const GET = route(async ({ session, params }) => {
  const prepared = await prepareIntent(params.id as string, session.address);
  const round = await getRound(params.id as string);
  return { ...prepared, typedData: intentSigningPayload(prepared.intent, round.settlementContract) };
});

export const POST = route(async ({ session, request, params }) => {
  const { intent, signature } = await body<{ intent: PortfolioIntent; signature: Hex }>(request);
  return { status: await submitIntent(params.id as string, session.address, intent, signature) };
});
