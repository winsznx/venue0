import type { Hex } from "viem";
import { body, InputError, route } from "@/lib/server/api";
import { swapBuild, swapPrepare, swapRecord } from "@/lib/server/residuals";
import { getRound } from "@/lib/server/rounds";

/** Residual swap from the user's own wallet in three calls: prepare (approval or quote), build (swap tx), record (tx hash). */
export const POST = route(async ({ session, request, params }) => {
  const input = await body<{ step: "prepare" | "build" | "record"; permitSignature?: Hex | null; txHash?: Hex }>(request);
  const round = await getRound(params.id as string);
  if (input.step === "prepare") return swapPrepare(round, session.address);
  if (input.step === "build") return { tx: await swapBuild(round, session.address, input.permitSignature ?? null) };
  if (input.step === "record" && input.txHash) return swapRecord(round, session.address, input.txHash);
  throw new InputError("Unknown swap step.");
});
