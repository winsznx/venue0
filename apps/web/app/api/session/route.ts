import { json } from "@/lib/server/api";
import { AuthError, clearSession, getSession, setSession, verifyDynamicToken } from "@/lib/server/session";
import { getUser, upsertUser } from "@/lib/server/users";

/** Exchanges a Dynamic JWT plus the wallet it verified for a Venue0 session cookie. */
export async function POST(request: Request) {
  try {
    const { token, address } = (await request.json()) as { token?: string; address?: string };
    if (!token || !address) return json({ error: "token and address are required" }, 400);
    const session = await verifyDynamicToken(token, address);
    await setSession(session);
    const user = await upsertUser({ address: session.address, dynamicUserId: session.dynamicUserId, walletKind: session.walletKind, ...(session.email ? { email: session.email } : {}) });
    return json({ user });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, 401);
    console.error(JSON.stringify({ event: "session.error", error: (error as Error).message }));
    return json({ error: "Could not verify the Dynamic session." }, 401);
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return json({ user: null });
  return json({ user: (await getUser(session.address)) ?? null });
}

export async function DELETE() {
  await clearSession();
  return json({ ok: true });
}
