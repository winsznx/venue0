import { route } from "@/lib/server/api";
import { currentOrOpenRound } from "@/lib/server/rounds";

/** Enter the lobby: returns the circle's live round, opening one with a fresh snapshot when none is running. */
export const POST = route(async ({ session, params }) => ({ roundId: (await currentOrOpenRound(params.id as string, session.address)).id }));
