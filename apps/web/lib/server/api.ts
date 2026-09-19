import "server-only";
import { randomUUID } from "node:crypto";
import { UniswapApiError } from "@venue0/uniswap";
import { log, requestContext } from "./log";
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
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const path = new URL(request.url).pathname;
    const started = performance.now();
    return requestContext.run({ requestId }, async () => {
      const respond = (response: Response) => {
        response.headers.set("x-request-id", requestId);
        log("api.request", { method: request.method, path, status: response.status, ms: Math.round(performance.now() - started) }, response.status >= 500 ? "error" : "info");
        return response;
      };
      try {
        const session = await requireSession();
        const store = requestContext.getStore();
        if (store) store.user = session.address;
        return respond(json(await fn({ session, request, params: await context.params })));
      } catch (error) {
        const known = classify(error);
        if (known) return respond(json({ error: known.message, requestId }, known.status));
        log("api.error", { path, error: (error as Error).message.split("\n")[0], stack: (error as Error).stack?.split("\n").slice(1, 4) }, "error");
        return respond(json({ error: `Unexpected server error (request ${requestId.slice(0, 8)}). ${(error as Error).message.split("\n")[0]}`, requestId }, 500));
      }
    });
  };
}

/** Failures with a known cause get a specific status and a message the user can act on. */
function classify(error: unknown): { status: number; message: string } | undefined {
  if (error instanceof AuthError) return { status: 401, message: error.message };
  if (error instanceof InputError) return { status: 400, message: error.message };
  if (error instanceof RoundError || error instanceof CircleError) return { status: 409, message: error.message };
  if (error instanceof UniswapApiError) return { status: 502, message: `Uniswap refused the request (${error.error.errorCode}): ${error.error.detail || "no route for this pair right now"}.` };
  const e = error as { name?: string; code?: string; message?: string };
  const message = e.message ?? "";
  if (e.code === "ECONNREFUSED" || e.code === "ENOTFOUND" || e.code === "CONNECTION_ENDED" || e.code === "CONNECTION_CLOSED" || e.code === "CONNECTION_DESTROYED" || /CONNECTION_CLOSED|hyperdrive/i.test(message) || e.code === "57P01" || /database|postgres|PGlite/i.test(message)) {
    log("dependency.down", { dependency: "database", code: e.code, error: message.split("\n")[0] }, "error");
    return { status: 503, message: "Venue0 lost its database connection while handling this. Check the page before retrying; the step may not have completed." };
  }
  if (e.name === "HttpRequestError" || e.name === "TimeoutError" || e.name === "RpcRequestError" || /HTTP request failed|fetch failed/i.test(message)) {
    log("dependency.down", { dependency: "rpc", error: message.split("\n")[0] }, "error");
    return { status: 503, message: "Robinhood Chain's RPC is not responding right now. Try again shortly." };
  }
  return undefined;
}
