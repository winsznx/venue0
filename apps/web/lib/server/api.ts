import "server-only";
import { CircleError } from "./circles";
import { fromJson, toJson } from "./db/client";
import { RoundError } from "./rounds";
import { AuthError, getSession, type Session } from "./session";

/** JSON responses carry bigints as {"$bigint": "..."}; lib/json.ts revives them in the browser. */
export function json(data: unknown, status = 200): Response {
  return new Response(toJson(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function body<T>(request: Request): Promise<T> {
  return fromJson<T>(await request.text());
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AuthError("Sign in to continue.");
  return session;
}

/** Bad input from the client: returned as 400 with its message. */
export class InputError extends Error {}

type RouteContext = { params: Promise<Record<string, string>> };
type Handler = (input: { session: Session; request: Request; params: Record<string, string> }) => Promise<unknown>;

/**
 * Authenticated JSON route. Expected failures become 4xx with a user-readable message; anything else is logged and
 * returned as 500 with its first line only.
 */
export function route(fn: Handler) {
  return async (request: Request, context: RouteContext): Promise<Response> => {
    try {
      const session = await requireSession();
      return json(await fn({ session, request, params: await context.params }));
    } catch (error) {
      if (error instanceof AuthError) return json({ error: error.message }, 401);
      if (error instanceof InputError) return json({ error: error.message }, 400);
      if (error instanceof RoundError || error instanceof CircleError) return json({ error: error.message }, 409);
      console.error(JSON.stringify({ event: "api.error", path: new URL(request.url).pathname, error: (error as Error).message, stack: (error as Error).stack?.split("\n").slice(0, 4) }));
      return json({ error: (error as Error).message.split("\n")[0] }, 500);
    }
  };
}
