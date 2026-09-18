import { route } from "@/lib/server/api";
import { roundView } from "@/lib/server/round-view";

export const GET = route(async ({ session, params }) => roundView(params.id as string, session.address));
