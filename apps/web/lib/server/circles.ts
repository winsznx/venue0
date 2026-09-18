import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getAddress, keccak256, stringToHex, type Address } from "viem";
import { db, fromJson } from "./db/client";
import { priceable, universe } from "./portfolio";
import { key, logActivity } from "./users";

export type Visibility = "PUBLIC" | "INVITE_ONLY" | "PRIVATE";
/** What happens to an owner's residual when the round cannot cross it. */
export type ResidualBehavior = "ECONOMIC" | "CARRY_FORWARD" | "CANCEL";

export type Circle = {
  id: string;
  name: string;
  description: string;
  visibility: Visibility;
  organizer: Address;
  assetUids: string[];
  assetSymbols: string[];
  minParticipants: number;
  cadenceSec: number | null;
  durationSec: number;
  residualBehavior: ResidualBehavior;
  privacyMode: "DELTAS_ONLY" | "AGGREGATE_ONLY";
  createdAt: string;
  memberCount: number;
};

export class CircleError extends Error {}

type CircleRow = { id: string; name: string; description: string; visibility: string; organizer: string; asset_uids: unknown; min_participants: number; cadence_sec: number | null; duration_sec: number; residual_behavior: string; privacy_mode: string; created_at: Date; member_count: string | number };

const inviteHash = (code: string) => createHash("sha256").update(code).digest("hex");

export async function assetChoices(): Promise<Array<{ uid: string; symbol: string }>> {
  const u = await universe();
  return priceable(u.registry, u.feeds).map(({ token }) => ({ uid: token.uid, symbol: token.symbol })).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

async function toCircle(r: CircleRow): Promise<Circle> {
  const uids = fromJson<string[]>(r.asset_uids);
  const symbols = new Map((await assetChoices()).map((a) => [a.uid, a.symbol]));
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    visibility: r.visibility as Visibility,
    organizer: getAddress(r.organizer),
    assetUids: uids,
    assetSymbols: uids.map((u) => symbols.get(u) ?? u.slice(0, 8)),
    minParticipants: r.min_participants,
    cadenceSec: r.cadence_sec,
    durationSec: r.duration_sec,
    residualBehavior: r.residual_behavior as ResidualBehavior,
    privacyMode: r.privacy_mode as Circle["privacyMode"],
    createdAt: new Date(r.created_at).toISOString(),
    memberCount: Number(r.member_count),
  };
}

const SELECT = "select c.*, (select count(*) from memberships m where m.circle_id = c.id) as member_count from circles c";

export type CircleInput = {
  name: string;
  description: string;
  visibility: Visibility;
  assetUids: string[];
  minParticipants: number;
  cadenceSec: number | null;
  durationSec: number;
  residualBehavior: ResidualBehavior;
  privacyMode: Circle["privacyMode"];
};

/** Validation mirrors CircleService (packages/circles) so the rules stay identical whether state is in memory or in Postgres. */
export async function createCircle(organizer: Address, input: CircleInput): Promise<Circle> {
  const name = input.name.trim();
  if (name.length < 3 || name.length > 60) throw new CircleError("Give the circle a name between 3 and 60 characters.");
  if (input.description.length > 400) throw new CircleError("Keep the description under 400 characters.");
  const valid = new Set((await assetChoices()).map((a) => a.uid));
  const assets = [...new Set(input.assetUids)];
  if (assets.length < 2) throw new CircleError("Pick at least two Stock Tokens, or nothing can cross.");
  for (const uid of assets) if (!valid.has(uid)) throw new CircleError(`${uid} is not a priceable canonical Stock Token.`);
  if (!Number.isInteger(input.minParticipants) || input.minParticipants < 2 || input.minParticipants > 50) throw new CircleError("Minimum participants must be between 2 and 50.");
  if (input.durationSec < 120 || input.durationSec > 86_400) throw new CircleError("Round duration must be between 2 minutes and 24 hours.");
  if (input.cadenceSec !== null && input.cadenceSec < input.durationSec) throw new CircleError("Cadence must be at least the round duration.");

  const id = keccak256(stringToHex(`circle:${organizer}:${name}:${Date.now()}:${randomBytes(8).toString("hex")}`));
  const d = await db();
  await d.tx(async (t) => {
    await t.query(
      `insert into circles (id, name, description, visibility, organizer, asset_uids, min_participants, cadence_sec, duration_sec, residual_behavior, privacy_mode)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)`,
      [id, name, input.description.trim(), input.visibility, key(organizer), JSON.stringify(assets), input.minParticipants, input.cadenceSec, input.durationSec, input.residualBehavior, input.privacyMode],
    );
    await t.query("insert into memberships (circle_id, address, role) values ($1, $2, 'ORGANIZER')", [id, key(organizer)]);
  });
  await logActivity(organizer, "CIRCLE_CREATED", { name }, { circleId: id });
  return getCircle(id);
}

export async function getCircle(id: string): Promise<Circle> {
  const [row] = await (await db()).query<CircleRow>(`${SELECT} where c.id = $1`, [id]);
  if (!row) throw new CircleError("This circle does not exist.");
  return toCircle(row);
}

export async function findCircle(id: string): Promise<Circle | undefined> {
  return getCircle(id).catch((error: unknown) => {
    if (error instanceof CircleError) return undefined;
    throw error;
  });
}

export async function listPublicCircles(): Promise<Circle[]> {
  const rows = await (await db()).query<CircleRow>(`${SELECT} where c.visibility = 'PUBLIC' order by c.created_at desc`);
  return Promise.all(rows.map(toCircle));
}

export async function listMyCircles(address: string): Promise<Circle[]> {
  const rows = await (await db()).query<CircleRow>(`${SELECT} where exists (select 1 from memberships m where m.circle_id = c.id and m.address = $1) order by c.created_at desc`, [key(address)]);
  return Promise.all(rows.map(toCircle));
}

export async function membership(circleId: string, address: string): Promise<"ORGANIZER" | "MEMBER" | undefined> {
  const [row] = await (await db()).query<{ role: string }>("select role from memberships where circle_id = $1 and address = $2", [circleId, key(address)]);
  return row?.role as "ORGANIZER" | "MEMBER" | undefined;
}

export async function listMembers(circleId: string): Promise<Array<{ address: Address; role: string; joinedAt: string }>> {
  const rows = await (await db()).query<{ address: string; role: string; joined_at: Date }>("select * from memberships where circle_id = $1 order by joined_at", [circleId]);
  return rows.map((r) => ({ address: getAddress(r.address), role: r.role, joinedAt: new Date(r.joined_at).toISOString() }));
}

/** Idempotent. Invite-only circles consume a single-use invite; private circles cannot be joined from outside. */
export async function joinCircle(circleId: string, address: Address, inviteCode?: string): Promise<void> {
  const circle = await getCircle(circleId);
  if (await membership(circleId, address)) return;
  const d = await db();
  const joined = await d.tx(async (t) => {
    if (circle.visibility === "PRIVATE") throw new CircleError("Private circles are joined only when the organizer adds you.");
    if (circle.visibility === "INVITE_ONLY") {
      const used = await t.query("update invites set used_by = $3, used_at = now() where code_hash = $1 and circle_id = $2 and used_by is null returning code_hash", [inviteHash(inviteCode ?? ""), circleId, key(address)]);
      if (used.length === 0) throw new CircleError("That invite code is invalid or has already been used.");
    }
    return (await t.query("insert into memberships (circle_id, address, role) values ($1, $2, 'MEMBER') on conflict do nothing returning address", [circleId, key(address)])).length > 0;
  });
  if (joined) await logActivity(address, "CIRCLE_JOINED", { name: circle.name }, { circleId });
}

/** Organizer adds a known wallet to a private circle directly. */
export async function addMember(circleId: string, organizer: Address, member: Address): Promise<void> {
  if ((await membership(circleId, organizer)) !== "ORGANIZER") throw new CircleError("Only the organizer can add members.");
  const d = await db();
  await d.query("insert into users (address) values ($1) on conflict do nothing", [key(member)]);
  await d.query("insert into memberships (circle_id, address, role) values ($1, $2, 'MEMBER') on conflict do nothing", [circleId, key(member)]);
}

/** Single-use invite. Only its hash is stored, so a database leak does not leak working invites. */
export async function createInvite(circleId: string, organizer: Address): Promise<string> {
  if ((await membership(circleId, organizer)) !== "ORGANIZER") throw new CircleError("Only the organizer can create invites.");
  const code = randomBytes(12).toString("base64url");
  await (await db()).query("insert into invites (code_hash, circle_id, created_by) values ($1, $2, $3)", [inviteHash(code), circleId, key(organizer)]);
  return code;
}
