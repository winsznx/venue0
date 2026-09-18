import { route } from "@/lib/server/api";
import { createInvite } from "@/lib/server/circles";

export const POST = route(async ({ session, params }) => ({ code: await createInvite(params.id as string, session.address) }));
