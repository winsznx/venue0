import "server-only";
import { getAddress, type Address } from "viem";
import { db, fromJson, toJson } from "./db/client";

export type AgentMode = "STRUCTURED" | "NATURAL_LANGUAGE";
export type ResidualPreference = "ECONOMIC" | "CARRY_FORWARD" | "ASK_ME";

export type User = {
  address: Address;
  dynamicUserId: string | null;
  email: string | null;
  walletKind: string | null;
  onboardedAt: string | null;
  agentMode: AgentMode;
  residualPreference: ResidualPreference;
  createdAt: string;
};

type UserRow = { address: string; dynamic_user_id: string | null; email: string | null; wallet_kind: string | null; onboarded_at: Date | null; agent_mode: string; residual_preference: string; created_at: Date };

const toUser = (r: UserRow): User => ({
  address: getAddress(r.address),
  dynamicUserId: r.dynamic_user_id,
  email: r.email,
  walletKind: r.wallet_kind,
  onboardedAt: r.onboarded_at ? new Date(r.onboarded_at).toISOString() : null,
  agentMode: r.agent_mode as AgentMode,
  residualPreference: r.residual_preference as ResidualPreference,
  createdAt: new Date(r.created_at).toISOString(),
});

/** Addresses are stored lowercase so lookups never depend on checksum casing. */
export const key = (address: string) => address.toLowerCase();

export async function upsertUser(input: { address: Address; dynamicUserId?: string; email?: string; walletKind?: string }): Promise<User> {
  const d = await db();
  const [row] = await d.query<UserRow>(
    `insert into users (address, dynamic_user_id, email, wallet_kind) values ($1, $2, $3, $4)
     on conflict (address) do update set last_seen_at = now(),
       dynamic_user_id = coalesce(excluded.dynamic_user_id, users.dynamic_user_id),
       email = coalesce(excluded.email, users.email),
       wallet_kind = coalesce(excluded.wallet_kind, users.wallet_kind)
     returning *`,
    [key(input.address), input.dynamicUserId ?? null, input.email ?? null, input.walletKind ?? null],
  );
  return toUser(row as UserRow);
}

export async function getUser(address: string): Promise<User | undefined> {
  const [row] = await (await db()).query<UserRow>("select * from users where address = $1", [key(address)]);
  return row ? toUser(row) : undefined;
}

export async function completeOnboarding(address: Address, agentMode: AgentMode) {
  await (await db()).query("update users set onboarded_at = coalesce(onboarded_at, now()), agent_mode = $2 where address = $1", [key(address), agentMode]);
  await logActivity(address, "ONBOARDED", {});
}

export async function updateSettings(address: Address, settings: { agentMode: AgentMode; residualPreference: ResidualPreference }) {
  await (await db()).query("update users set agent_mode = $2, residual_preference = $3 where address = $1", [key(address), settings.agentMode, settings.residualPreference]);
}

export type TargetWeight = { uid: string; symbol: string; weightBps: number };
export type SavedTarget = { weights: TargetWeight[]; cashBps: number; source: "STRUCTURED" | "NATURAL_LANGUAGE"; instruction: string | null; maxExternalCostBps: number; residualStyle: "ANY" | "LIMIT" | "TWAP" | "WAIT"; updatedAt: string };

export async function getTarget(address: string): Promise<SavedTarget | undefined> {
  const [row] = await (await db()).query<{ weights: unknown; source: string; instruction: string | null; updated_at: Date }>("select * from targets where address = $1", [key(address)]);
  if (!row) return undefined;
  const body = fromJson<Omit<SavedTarget, "source" | "instruction" | "updatedAt">>(row.weights);
  return { ...body, source: row.source as SavedTarget["source"], instruction: row.instruction, updatedAt: new Date(row.updated_at).toISOString() };
}

export async function saveTarget(address: Address, target: Omit<SavedTarget, "updatedAt">) {
  const body = { weights: target.weights, cashBps: target.cashBps, maxExternalCostBps: target.maxExternalCostBps, residualStyle: target.residualStyle };
  await (await db()).query(
    `insert into targets (address, weights, source, instruction) values ($1, $2::jsonb, $3, $4)
     on conflict (address) do update set weights = excluded.weights, source = excluded.source, instruction = excluded.instruction, updated_at = now()`,
    [key(address), toJson(body), target.source, target.instruction],
  );
  await logActivity(address, "TARGET_SAVED", { weights: target.weights.map((w) => `${w.symbol} ${(w.weightBps / 100).toFixed(1)}%`), cashBps: target.cashBps });
}

export type ActivityKind =
  | "ONBOARDED"
  | "TARGET_SAVED"
  | "CIRCLE_CREATED"
  | "CIRCLE_JOINED"
  | "INTENT_SIGNED"
  | "ROUND_MATCHED"
  | "PLAN_APPROVED"
  | "ALLOWANCE_SET"
  | "SETTLED"
  | "RESIDUAL_DECIDED"
  | "RECEIPT_VERIFIED"
  | "ROUND_CLOSED";

export type Activity = { id: string; kind: ActivityKind; roundId: string | null; circleId: string | null; detail: Record<string, unknown>; createdAt: string };

export async function logActivity(address: string, kind: ActivityKind, detail: Record<string, unknown>, refs: { roundId?: string; circleId?: string } = {}) {
  await (await db()).query("insert into activity (address, kind, round_id, circle_id, detail) values ($1, $2, $3, $4, $5::jsonb)", [key(address), kind, refs.roundId ?? null, refs.circleId ?? null, toJson(detail)]);
}

export async function listActivity(address: string, limit = 100): Promise<Activity[]> {
  const rows = await (await db()).query<{ id: string | number; kind: string; round_id: string | null; circle_id: string | null; detail: unknown; created_at: Date }>(
    "select * from activity where address = $1 order by created_at desc, id desc limit $2",
    [key(address), limit],
  );
  return rows.map((r) => ({ id: String(r.id), kind: r.kind as ActivityKind, roundId: r.round_id, circleId: r.circle_id, detail: fromJson<Record<string, unknown>>(r.detail), createdAt: new Date(r.created_at).toISOString() }));
}
