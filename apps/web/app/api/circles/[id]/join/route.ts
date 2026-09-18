import { body, route } from "@/lib/server/api";
import { joinCircle } from "@/lib/server/circles";

export const POST = route(async ({ session, request, params }) => {
  const { invite } = await body<{ invite?: string }>(request);
  await joinCircle(params.id as string, session.address, invite?.trim() || undefined);
  return { ok: true };
});
