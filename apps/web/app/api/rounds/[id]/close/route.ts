import { route } from "@/lib/server/api";
import { closeCollection } from "@/lib/server/rounds";

export const POST = route(async ({ session, params }) => ({ state: (await closeCollection(params.id as string, session.address)).state }));
