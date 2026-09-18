import "server-only";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { getAddress, isAddress, type Address } from "viem";
import { env } from "./env";

const COOKIE = "venue0_session";
const TTL_SEC = 7 * 24 * 3_600;

export type Session = { address: Address; dynamicUserId: string; walletKind: string; email: string | null };

/** HS256 key for our own session cookie. SESSION_SECRET in production; otherwise generated once and kept beside the local database. */
function sessionKey(): Uint8Array {
  if (env.sessionSecret) return new TextEncoder().encode(env.sessionSecret);
  const dir = resolve(process.cwd(), ".venue0-db");
  const file = resolve(dir, "session.secret");
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, randomBytes(48).toString("base64url"), { mode: 0o600 });
  }
  return new TextEncoder().encode(readFileSync(file, "utf8").trim());
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

type DynamicClaims = {
  sub: string;
  scope?: string;
  email?: string;
  verified_credentials?: Array<{ address?: string; chain?: string; wallet_provider?: string; wallet_name?: string; format?: string }>;
};

export class AuthError extends Error {}

/**
 * Verifies a Dynamic JWT (RS256, per-environment JWKS) and binds the session to one EVM wallet the token proves.
 * The wallet must appear in verified_credentials: a client cannot claim an address Dynamic did not verify.
 */
export async function verifyDynamicToken(token: string, walletAddress: string): Promise<Session> {
  if (!env.dynamicEnvironmentId) throw new AuthError("Dynamic is not configured on this server (DYNAMIC_ENVIRONMENT_ID).");
  jwks ??= createRemoteJWKSet(new URL(`https://app.dynamicauth.com/api/v0/sdk/${env.dynamicEnvironmentId}/.well-known/jwks`));
  const { payload } = await jwtVerify<DynamicClaims>(token, jwks, { issuer: `app.dynamicauth.com/${env.dynamicEnvironmentId}`, algorithms: ["RS256"] });
  if (!(payload.scope ?? "").split(" ").includes("user:basic")) throw new AuthError("Dynamic session is not fully authenticated yet.");
  if (!isAddress(walletAddress, { strict: false })) throw new AuthError("No EVM wallet on this session.");
  const credential = (payload.verified_credentials ?? []).find((c) => c.chain === "eip155" && c.address && c.address.toLowerCase() === walletAddress.toLowerCase());
  if (!credential) throw new AuthError("That wallet is not verified on this Dynamic session.");
  return { address: getAddress(walletAddress), dynamicUserId: payload.sub, walletKind: credential.wallet_provider ?? credential.wallet_name ?? "unknown", email: payload.email ?? null };
}

export async function setSession(session: Session) {
  const jwt = await new SignJWT({ ...session }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${TTL_SEC}s`).sign(sessionKey());
  (await cookies()).set(COOKIE, jwt, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_SEC });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | undefined> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return undefined;
  try {
    const { payload } = await jwtVerify<Session>(raw, sessionKey(), { algorithms: ["HS256"] });
    return { address: getAddress(payload.address), dynamicUserId: payload.dynamicUserId, walletKind: payload.walletKind, email: payload.email ?? null };
  } catch {
    return undefined;
  }
}
