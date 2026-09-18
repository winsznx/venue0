import { createHash, randomBytes } from "node:crypto";
import { getAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import { matchRound, type MatchResult } from "@venue0/matcher";
import { hashValuationSnapshot, type AssetDeltaLimit, type PortfolioIntent, type ValuationSnapshot } from "@venue0/portfolio";
import { verifyIntentSignature } from "@venue0/settlement";
import type { AssetUid } from "@venue0/shared";

export type Visibility = "PRIVATE" | "INVITE_ONLY" | "PUBLIC";
export type PrivacyMode = "DELTAS_ONLY" | "AGGREGATE_ONLY";

/** PRD 11.2. `roundCadenceSec` makes a circle recurring: rounds open every N seconds from `cadenceAnchor`. */
export type CrossingCircle = {
  id: Hex;
  name: string;
  visibility: Visibility;
  organizer: Address;
  allowedAssetUids: AssetUid[];
  minParticipants: number;
  roundCadenceSec?: number;
  cadenceAnchor?: number;
  defaultRoundDurationSec: number;
  privacyMode: PrivacyMode;
  createdAt: number;
};

export type Member = { address: Address; role: "ORGANIZER" | "MEMBER"; joinedAt: number };

export type RoundState =
  | "DRAFT"
  | "OPEN"
  | "COLLECTING"
  | "FROZEN"
  | "SOLVING"
  | "PROPOSED"
  | "APPROVING"
  | "READY_TO_SETTLE"
  | "SETTLING"
  | "SETTLED"
  | "RESIDUAL_EXECUTION"
  | "VERIFYING"
  | "COMPLETE"
  | "EXPIRED"
  | "INSUFFICIENT_PARTICIPANTS"
  | "NO_CROSS"
  | "PLAN_REJECTED"
  | "PLAN_STALE"
  | "SETTLEMENT_REVERTED"
  | "RESIDUAL_PARTIAL"
  | "RESIDUAL_FAILED"
  | "VERIFICATION_FAILED"
  | "CANCELLED";

/** PRD 12. Every transition not listed here is rejected. */
export const TRANSITIONS: Record<RoundState, RoundState[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["COLLECTING", "EXPIRED", "CANCELLED", "FROZEN"],
  COLLECTING: ["FROZEN", "EXPIRED", "CANCELLED"],
  FROZEN: ["SOLVING"],
  SOLVING: ["PROPOSED", "NO_CROSS", "INSUFFICIENT_PARTICIPANTS", "PLAN_STALE"],
  PROPOSED: ["APPROVING", "PLAN_REJECTED", "PLAN_STALE"],
  APPROVING: ["READY_TO_SETTLE", "PLAN_REJECTED", "PLAN_STALE"],
  READY_TO_SETTLE: ["SETTLING", "PLAN_STALE"],
  SETTLING: ["SETTLED", "SETTLEMENT_REVERTED"],
  SETTLED: ["RESIDUAL_EXECUTION", "VERIFYING"],
  RESIDUAL_EXECUTION: ["VERIFYING", "RESIDUAL_PARTIAL", "RESIDUAL_FAILED"],
  RESIDUAL_PARTIAL: ["VERIFYING"],
  RESIDUAL_FAILED: ["VERIFYING"],
  VERIFYING: ["COMPLETE", "VERIFICATION_FAILED"],
  COMPLETE: [],
  EXPIRED: [],
  INSUFFICIENT_PARTICIPANTS: [],
  NO_CROSS: [],
  PLAN_REJECTED: [],
  PLAN_STALE: [],
  SETTLEMENT_REVERTED: [],
  VERIFICATION_FAILED: [],
  CANCELLED: [],
};

export type CircleRound = {
  id: Hex;
  circleId: Hex;
  sequence: number;
  state: RoundState;
  opensAt: number;
  freezesAt: number;
  settlementContract: Address;
  intents: Map<Address, { intent: PortfolioIntent; signature: Hex; intentHash: string }>;
  /** Residuals carried in from an earlier round of the same circle (AGGREGATE decisions), keyed by owner. */
  carriedIn: Map<Address, AssetDeltaLimit[]>;
  snapshotHash?: Hex;
  match?: MatchResult;
  history: Array<{ at: number; from: RoundState; to: RoundState; reason?: string }>;
};

export class CircleError extends Error {}

const inviteHash = (code: string) => createHash("sha256").update(code).digest("hex");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Circles: the distribution layer. A circle scopes who may cross, which Stock Tokens are in play, and when rounds run.
 * Rounds use the production matcher; nothing here computes amounts. State is in memory; persistence belongs to the API.
 */
export class CircleService {
  private readonly circles = new Map<Hex, CrossingCircle>();
  private readonly members = new Map<Hex, Map<string, Member>>();
  private readonly invites = new Map<Hex, Set<string>>();
  private readonly rounds = new Map<Hex, CircleRound>();

  constructor(private readonly universe: ReadonlyMap<AssetUid, Address>, private readonly clock: () => number = () => Math.floor(Date.now() / 1000)) {}

  createCircle(input: Omit<CrossingCircle, "id" | "createdAt">): CrossingCircle {
    if (!input.name.trim()) throw new CircleError("circle name is required");
    if (input.allowedAssetUids.length === 0) throw new CircleError("a circle needs at least one asset");
    for (const uid of input.allowedAssetUids) if (!this.universe.has(uid)) throw new CircleError(`asset ${uid} is not a canonical Stock Token`);
    if (input.minParticipants < 2) throw new CircleError("crossing needs at least 2 participants");
    if (input.roundCadenceSec !== undefined && input.roundCadenceSec < input.defaultRoundDurationSec) throw new CircleError("cadence must be at least the round duration");
    const createdAt = this.clock();
    const circle: CrossingCircle = { ...input, organizer: getAddress(input.organizer), id: keccak256(stringToHex(`circle:${input.organizer}:${input.name}:${createdAt}:${randomBytes(8).toString("hex")}`)), createdAt };
    this.circles.set(circle.id, circle);
    this.members.set(circle.id, new Map([[circle.organizer.toLowerCase(), { address: circle.organizer, role: "ORGANIZER", joinedAt: createdAt }]]));
    this.invites.set(circle.id, new Set());
    return circle;
  }

  getCircle(id: Hex): CrossingCircle {
    const circle = this.circles.get(id);
    if (!circle) throw new CircleError(`unknown circle ${id}`);
    return circle;
  }

  /** Circles a viewer can discover: public ones, plus any they belong to. */
  listCircles(viewer?: Address): CrossingCircle[] {
    return [...this.circles.values()].filter((c) => c.visibility === "PUBLIC" || (viewer !== undefined && this.isMember(c.id, viewer)));
  }

  /** Organizer creates a single-use invite. Only its hash is stored. */
  createInvite(circleId: Hex, organizer: Address): string {
    this.requireOrganizer(circleId, organizer);
    const code = randomBytes(16).toString("base64url");
    (this.invites.get(circleId) as Set<string>).add(inviteHash(code));
    return code;
  }

  /** Idempotent: joining twice returns the existing membership. */
  join(circleId: Hex, address: Address, options: { inviteCode?: string; addedBy?: Address } = {}): Member {
    const circle = this.getCircle(circleId);
    const existing = this.members.get(circleId)?.get(address.toLowerCase());
    if (existing) return existing;
    if (circle.visibility === "PRIVATE" && !(options.addedBy && same(options.addedBy, circle.organizer))) throw new CircleError("private circles are joined only when the organizer adds you");
    if (circle.visibility === "INVITE_ONLY") {
      const hash = options.inviteCode ? inviteHash(options.inviteCode) : "";
      const pool = this.invites.get(circleId) as Set<string>;
      if (!pool.has(hash)) throw new CircleError("invalid or used invite code");
      pool.delete(hash);
    }
    const member: Member = { address: getAddress(address), role: "MEMBER", joinedAt: this.clock() };
    (this.members.get(circleId) as Map<string, Member>).set(address.toLowerCase(), member);
    return member;
  }

  isMember(circleId: Hex, address: Address): boolean {
    return this.members.get(circleId)?.has(address.toLowerCase()) ?? false;
  }

  /** Member list. AGGREGATE_ONLY circles show members only the count; the organizer always sees the list. */
  listMembers(circleId: Hex, viewer: Address): Member[] | { count: number } {
    const circle = this.getCircle(circleId);
    if (!this.isMember(circleId, viewer)) throw new CircleError("only members can view the member list");
    const members = [...(this.members.get(circleId) as Map<string, Member>).values()];
    if (circle.privacyMode === "AGGREGATE_ONLY" && !same(viewer, circle.organizer)) return { count: members.length };
    return members;
  }

  createRound(circleId: Hex, organizer: Address, settlementContract: Address, opensAt = this.clock()): CircleRound {
    const circle = this.requireOrganizer(circleId, organizer);
    const sequence = [...this.rounds.values()].filter((r) => r.circleId === circleId).length + 1;
    const round: CircleRound = {
      id: keccak256(stringToHex(`round:${circleId}:${sequence}`)),
      circleId,
      sequence,
      state: "DRAFT",
      opensAt,
      freezesAt: opensAt + circle.defaultRoundDurationSec,
      settlementContract: getAddress(settlementContract),
      intents: new Map(),
      carriedIn: new Map(),
      history: [],
    };
    this.rounds.set(round.id, round);
    return round;
  }

  /** Next scheduled round window for a recurring circle. */
  nextRoundWindow(circleId: Hex, now = this.clock()): { opensAt: number; freezesAt: number } | undefined {
    const circle = this.getCircle(circleId);
    if (!circle.roundCadenceSec) return undefined;
    const anchor = circle.cadenceAnchor ?? circle.createdAt;
    const elapsed = Math.max(0, now - anchor);
    const opensAt = anchor + Math.ceil(elapsed / circle.roundCadenceSec) * circle.roundCadenceSec;
    return { opensAt, freezesAt: opensAt + circle.defaultRoundDurationSec };
  }

  getRound(id: Hex): CircleRound {
    const round = this.rounds.get(id);
    if (!round) throw new CircleError(`unknown round ${id}`);
    return round;
  }

  transition(roundId: Hex, to: RoundState, reason?: string): CircleRound {
    const round = this.getRound(roundId);
    if (!TRANSITIONS[round.state].includes(to)) throw new CircleError(`round ${round.state} cannot move to ${to}`);
    round.history.push({ at: this.clock(), from: round.state, to, ...(reason ? { reason } : {}) });
    round.state = to;
    return round;
  }

  openRound(roundId: Hex, organizer: Address): CircleRound {
    this.requireOrganizer(this.getRound(roundId).circleId, organizer);
    return this.transition(roundId, "OPEN");
  }

  /**
   * Accepts a signed intent from a member. Rejects non-members, assets outside the circle universe, wrong round or circle,
   * and bad signatures. Resubmitting the identical intent is idempotent; a changed intent replaces the old one until freeze.
   */
  async submitIntent(roundId: Hex, intent: PortfolioIntent, signature: Hex): Promise<"ACCEPTED" | "REPLACED" | "UNCHANGED"> {
    const round = this.getRound(roundId);
    const circle = this.getCircle(round.circleId);
    if (round.state !== "OPEN" && round.state !== "COLLECTING") throw new CircleError(`round is ${round.state}, not accepting intents`);
    if (this.clock() >= round.freezesAt) throw new CircleError("round collection window has closed");
    if (!this.isMember(circle.id, intent.owner)) throw new CircleError(`${intent.owner} is not a member of this circle`);
    if (intent.roundId !== round.id || intent.circleId !== circle.id) throw new CircleError("intent is bound to a different round or circle");
    for (const limit of intent.assets) {
      if (!circle.allowedAssetUids.includes(limit.assetUid)) throw new CircleError(`asset ${limit.assetUid} is outside this circle's universe`);
    }
    await verifyIntentSignature(intent, signature, round.settlementContract);

    const intentHash = keccak256(stringToHex(JSON.stringify(intent, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))));
    const key = getAddress(intent.owner);
    const previous = round.intents.get(key);
    if (previous?.intentHash === intentHash) return "UNCHANGED";
    round.intents.set(key, { intent, signature, intentHash });
    if (round.state === "OPEN") this.transition(roundId, "COLLECTING");
    return previous ? "REPLACED" : "ACCEPTED";
  }

  /** Freezes collection and runs the production matcher on the frozen intents and snapshot. */
  freezeAndSolve(roundId: Hex, snapshot: ValuationSnapshot): CircleRound {
    const round = this.getRound(roundId);
    const circle = this.getCircle(round.circleId);
    this.transition(roundId, "FROZEN");
    this.transition(roundId, "SOLVING");
    round.snapshotHash = hashValuationSnapshot(snapshot);
    if (round.intents.size < circle.minParticipants) {
      return this.transition(roundId, "INSUFFICIENT_PARTICIPANTS", `${round.intents.size} intents, circle requires ${circle.minParticipants}`);
    }
    const universe = new Map(circle.allowedAssetUids.map((uid) => [uid, this.universe.get(uid) as Address]));
    round.match = matchRound({ roundId: round.id, snapshot, intents: [...round.intents.values()].map((e) => e.intent), universe, nowSec: this.clock() });
    const status = round.match.status;
    if (status === "PLAN_STALE") return this.transition(roundId, "PLAN_STALE", round.match.statusReasons.join("; "));
    if (status === "INSUFFICIENT_PARTICIPANTS") return this.transition(roundId, "INSUFFICIENT_PARTICIPANTS", round.match.statusReasons.join("; "));
    if (status === "NO_CROSS") return this.transition(roundId, "NO_CROSS");
    return this.transition(roundId, "PROPOSED");
  }

  /**
   * AGGREGATE lifecycle: residuals the residual engine chose to aggregate are carried into the next round of the same
   * circle. Owners must still sign a fresh intent for the next round; carried residuals are what the agent pre-fills.
   */
  carryResiduals(fromRoundId: Hex, toRoundId: Hex, aggregated: Array<{ owner: Address; assetUid: AssetUid; side: "BUY" | "SELL"; amountRaw: bigint }>): Map<Address, AssetDeltaLimit[]> {
    const from = this.getRound(fromRoundId);
    const to = this.getRound(toRoundId);
    if (from.circleId !== to.circleId) throw new CircleError("residuals can only carry within the same circle");
    if (to.sequence <= from.sequence) throw new CircleError("residuals carry forward only");
    for (const r of aggregated) {
      if (!from.intents.has(getAddress(r.owner))) throw new CircleError(`${r.owner} had no intent in the source round`);
      const token = this.universe.get(r.assetUid) as Address;
      const list = to.carriedIn.get(getAddress(r.owner)) ?? [];
      list.push({ assetUid: r.assetUid, token, maxOutRaw: r.side === "SELL" ? r.amountRaw : 0n, maxInRaw: r.side === "BUY" ? r.amountRaw : 0n });
      to.carriedIn.set(getAddress(r.owner), list);
    }
    return to.carriedIn;
  }

  /**
   * Privacy-safe statistics (PRD 11.3): counts and notional totals only, never addresses or holdings. Per-asset figures
   * are suppressed when fewer than `minParticipantsPerAsset` participants touched the asset.
   */
  aggregateStats(roundId: Hex, minParticipantsPerAsset = 3) {
    const round = this.getRound(roundId);
    const match = round.match;
    const perAsset = new Map<AssetUid, { participants: Set<string>; requested: bigint; crossed: bigint }>();
    for (const f of match?.fills ?? []) {
      const entry = perAsset.get(f.assetUid) ?? { participants: new Set<string>(), requested: 0n, crossed: 0n };
      entry.participants.add(f.owner.toLowerCase());
      entry.requested += f.requestedValueUsdE18;
      entry.crossed += f.crossedValueUsdE18;
      perAsset.set(f.assetUid, entry);
    }
    return {
      roundId: round.id,
      sequence: round.sequence,
      state: round.state,
      participantCount: round.intents.size,
      assetsInvolved: perAsset.size,
      requestedNotionalUsdE18: match?.totals.requestedNotionalUsdE18 ?? 0n,
      crossedNotionalUsdE18: match?.totals.crossedNotionalUsdE18 ?? 0n,
      residualNotionalUsdE18: match?.totals.residualNotionalUsdE18 ?? 0n,
      crossRateBps: match?.totals.crossRateBps ?? 0n,
      completionRateBps: match && round.intents.size > 0 ? BigInt(Math.floor((match.totals.crossingParticipantCount / round.intents.size) * 10_000)) : 0n,
      perAsset: [...perAsset].map(([uid, e]) =>
        e.participants.size >= minParticipantsPerAsset
          ? { assetUid: uid, participants: e.participants.size, requestedNotionalUsdE18: e.requested, crossedNotionalUsdE18: e.crossed }
          : { assetUid: uid, suppressed: true as const },
      ),
    };
  }

  /** A member's own view: their fills plus the aggregate. Never another member's fills. */
  memberView(roundId: Hex, viewer: Address) {
    const round = this.getRound(roundId);
    if (!this.isMember(round.circleId, viewer)) throw new CircleError("only members can view round results");
    return { aggregate: this.aggregateStats(roundId), ownFills: (round.match?.fills ?? []).filter((f) => same(f.owner, viewer)) };
  }

  private requireOrganizer(circleId: Hex, address: Address): CrossingCircle {
    const circle = this.getCircle(circleId);
    if (!same(circle.organizer, address)) throw new CircleError("only the organizer can do this");
    return circle;
  }
}
