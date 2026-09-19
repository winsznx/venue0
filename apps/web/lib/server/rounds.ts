import "server-only";
import { createPublicClient, decodeFunctionData, encodeFunctionData, erc20Abi, getAddress, http, keccak256, stringToHex, type Address, type Hex, type PublicClient } from "viem";
import { fetchRobinhoodQuote, readChainlinkSnapshots, restSnapshot, snapshotDivergenceBps, type PriceSnapshot } from "@venue0/assets";
import { resolveGoal, intentFromPreview } from "@venue0/agent";
import { TRANSITIONS, type RoundState } from "@venue0/circles";
import { matchRound, type MatchResult } from "@venue0/matcher";
import { buildValuationSnapshot, hashValuationSnapshot, priceMap, type ExecutionPolicy, type Holding, type PortfolioIntent, type ValuationSnapshot } from "@venue0/portfolio";
import { approvalNonce, approvalTypedData, buildSettlementPlan, hashContractPlan, intentTypedData, requiredOutflows, venue0SettlementAbi, verifyIntentSignature, type ContractPlan, type SettlementPlan } from "@venue0/settlement";
import { robinhoodChain, ROBINHOOD_PUBLIC_RPC, type AssetUid } from "@venue0/shared";
import { verifySettlement, type SettlementVerification } from "@venue0/verifier";
import { getCircle, membership, type Circle } from "./circles";
import { db, fromJson, toJson } from "./db/client";
import { env } from "./env";
import { client, livePricesBySymbol, loadPortfolio, priceable, universe } from "./portfolio";
import { specFromTarget } from "./targets";
import { log, providerHost } from "./log";
import { getTarget, key, logActivity } from "./users";

export class RoundError extends Error {}

/** Rounds in these states are finished: a member entering the lobby gets a fresh round instead. */
const TERMINAL: ReadonlySet<RoundState> = new Set(["COMPLETE", "EXPIRED", "INSUFFICIENT_PARTICIPANTS", "NO_CROSS", "PLAN_REJECTED", "PLAN_STALE", "SETTLEMENT_REVERTED", "VERIFICATION_FAILED", "CANCELLED"]);
/** Participants have this long after the solve to approve and settle before the plan expires. */
const APPROVAL_WINDOW_SEC = 1_800;
/** A settlement step idle this long is assumed to belong to a request that died; the next reader resumes it. */
const RESUME_AFTER_SEC = 20;
/** D-003: a feed may not disagree with the normalized Robinhood REST price by more than this. */
const MAX_FEED_REST_DIVERGENCE_BPS = 100n;

export type RoundRecord = {
  id: Hex;
  circleId: Hex;
  sequence: number;
  state: RoundState;
  opensAt: number;
  freezesAt: number;
  settlementContract: Address;
  snapshot: ValuationSnapshot;
  snapshotHash: Hex;
  match: MatchResult | null;
  plan: SettlementPlan | null;
  settlementTx: Hex | null;
  verification: (SettlementVerification & { providers?: { executor: string; verifier: string; independent: boolean; fallbackReason?: string } }) | null;
  history: Array<{ at: number; from: RoundState; to: RoundState; reason: string | null }>;
};

type RoundRow = { id: string; circle_id: string; sequence: number; state: string; opens_at: string | number; freezes_at: string | number; settlement_contract: string; snapshot: unknown; snapshot_hash: string; match: unknown; plan: unknown; settlement_tx: string | null; verification: unknown };

const now = () => Math.floor(Date.now() / 1000);

export function settlementContract(): Address {
  if (!env.settlementContract) throw new RoundError("CROSSING_SETTLEMENT_ADDRESS is not configured; rounds cannot settle.");
  return getAddress(env.settlementContract);
}

/**
 * The verifier reads through its own RPC. Its provider host is recorded with every verification; when it is the same
 * host as the executor RPC the run is marked not independent rather than silently claimed as independent.
 */
type Providers = { executor: string; verifier: string; independent: boolean; fallbackReason?: string };

function verifierClient(): { client: PublicClient; providers: Providers } {
  const url = process.env.VERIFIER_RPC_URL || ROBINHOOD_PUBLIC_RPC;
  const executor = providerHost(env.rpcUrl);
  const verifier = providerHost(url);
  return { client: createPublicClient({ chain: robinhoodChain(url), transport: http(url) }) as PublicClient, providers: { executor, verifier, independent: executor !== verifier } };
}

async function hydrate(row: RoundRow): Promise<RoundRecord> {
  const history = await (await db()).query<{ at: string | number; from_state: string; to_state: string; reason: string | null }>("select * from round_history where round_id = $1 order by id", [row.id]);
  return {
    id: row.id as Hex,
    circleId: row.circle_id as Hex,
    sequence: row.sequence,
    state: row.state as RoundState,
    opensAt: Number(row.opens_at),
    freezesAt: Number(row.freezes_at),
    settlementContract: getAddress(row.settlement_contract),
    snapshot: fromJson<ValuationSnapshot>(row.snapshot),
    snapshotHash: row.snapshot_hash as Hex,
    match: row.match ? fromJson<MatchResult>(row.match) : null,
    plan: row.plan ? fromJson<SettlementPlan>(row.plan) : null,
    settlementTx: row.settlement_tx as Hex | null,
    verification: row.verification ? fromJson<SettlementVerification>(row.verification) : null,
    history: history.map((h) => ({ at: Number(h.at), from: h.from_state as RoundState, to: h.to_state as RoundState, reason: h.reason })),
  };
}

export async function getRound(id: string): Promise<RoundRecord> {
  const [row] = await (await db()).query<RoundRow>("select * from rounds where id = $1", [id]);
  if (!row) throw new RoundError("This round does not exist.");
  return hydrate(row);
}

export async function roundsForCircle(circleId: string): Promise<RoundRecord[]> {
  const rows = await (await db()).query<RoundRow>("select * from rounds where circle_id = $1 order by sequence desc", [circleId]);
  return Promise.all(rows.map(hydrate));
}

/** Guarded state change: the same PRD 12 table CircleService enforces, applied with a compare-and-set on the stored state. */
async function transition(round: RoundRecord, to: RoundState, reason?: string, patch: Record<string, unknown> = {}): Promise<RoundRecord> {
  if (!TRANSITIONS[round.state].includes(to)) throw new RoundError(`Round is ${round.state} and cannot move to ${to}.`);
  const columns = Object.keys(patch);
  const sets = columns.map((c, i) => `${c} = $${i + 4}${c === "match" || c === "plan" || c === "verification" ? "::text::jsonb" : ""}`);
  const d = await db();
  const moved = await d.tx(async (t) => {
    const rows = await t.query(`update rounds set state = $2${sets.length ? `, ${sets.join(", ")}` : ""} where id = $1 and state = $3 returning id`, [round.id, to, round.state, ...columns.map((c) => patch[c])]);
    if (rows.length === 0) return false;
    await t.query("insert into round_history (round_id, at, from_state, to_state, reason) values ($1, $2, $3, $4, $5)", [round.id, now(), round.state, to, reason ?? null]);
    return true;
  });
  log(moved ? "round.transition" : "round.transition_lost_race", { round: round.id, from: round.state, to, reason: reason ?? null }, moved ? "info" : "warn");
  return getRound(round.id);
}

/**
 * Chainlink valuation for the circle's assets, each cross-checked against the normalized Robinhood REST price (D-003).
 * Every intent in the round is signed against this snapshot's hash.
 */
async function captureSnapshot(circle: Circle): Promise<ValuationSnapshot> {
  const u = await universe();
  const list = priceable(u.registry, u.feeds).filter(({ token }) => circle.assetUids.includes(token.uid));
  const rpc = client();
  const at = now();
  const [readings, quotes] = await Promise.all([readChainlinkSnapshots(rpc, list, at), Promise.all(list.map(({ token }) => fetchRobinhoodQuote(token.symbol)))]);
  const prices: PriceSnapshot[] = list.map(({ token }, i) => {
    const reading = readings[i] as (typeof readings)[number];
    const divergence = snapshotDivergenceBps(reading.snapshot, restSnapshot(token, quotes[i] as (typeof quotes)[number], 300, at));
    if (divergence > MAX_FEED_REST_DIVERGENCE_BPS) throw new RoundError(`${token.symbol}: Chainlink and Robinhood prices disagree by ${divergence} bps, so the round cannot open safely right now.`);
    return reading.snapshot;
  });
  return buildValuationSnapshot(prices, at, circle.durationSec + APPROVAL_WINDOW_SEC);
}

/** The lobby entry point: the circle's live round, or a new one opened now with a fresh snapshot. */
export async function currentOrOpenRound(circleId: string, viewer: Address): Promise<RoundRecord> {
  if (!(await membership(circleId, viewer))) throw new RoundError("Join this circle before entering its round.");
  const [latest] = await roundsForCircle(circleId);
  if (latest && !TERMINAL.has(latest.state)) return advance(latest);
  const circle = await getCircle(circleId);
  const snapshot = await captureSnapshot(circle);
  const sequence = (latest?.sequence ?? 0) + 1;
  const id = keccak256(stringToHex(`venue0:round:${circleId}:${sequence}:${snapshot.capturedAt}`));
  const opensAt = now();
  await (await db()).query(
    `insert into rounds (id, circle_id, sequence, state, opens_at, freezes_at, settlement_contract, snapshot, snapshot_hash)
     values ($1, $2, $3, 'OPEN', $4, $5, $6, $7::text::jsonb, $8) on conflict (circle_id, sequence) do nothing`,
    [id, circleId, sequence, opensAt, opensAt + circle.durationSec, settlementContract(), toJson(snapshot), hashValuationSnapshot(snapshot)],
  );
  const [created] = await roundsForCircle(circleId);
  return created as RoundRecord;
}

export async function intentsFor(roundId: string): Promise<Array<{ owner: Address; intent: PortfolioIntent; signature: Hex }>> {
  const rows = await (await db()).query<{ owner: string; intent: unknown; signature: string }>("select owner, intent, signature from intents where round_id = $1 order by owner", [roundId]);
  return rows.map((r) => ({ owner: getAddress(r.owner), intent: fromJson<PortfolioIntent>(r.intent), signature: r.signature as Hex }));
}

/**
 * Moves a round forward on read: freezes and solves when its window closes (or every member has signed), and expires
 * a proposed plan nobody settled in time. Rounds have no background worker; any viewer's request advances them.
 */
export async function advance(round: RoundRecord): Promise<RoundRecord> {
  const t = now();
  if (round.state === "OPEN" || round.state === "COLLECTING") {
    const circle = await getCircle(round.circleId);
    const signed = (await intentsFor(round.id)).length;
    const everyoneSigned = signed >= circle.minParticipants && signed >= circle.memberCount;
    if (t >= round.freezesAt || everyoneSigned) return solve(round, everyoneSigned && t < round.freezesAt ? "every member signed" : "collection window closed");
  }
  if ((round.state === "PROPOSED" || round.state === "APPROVING" || round.state === "READY_TO_SETTLE") && round.plan && BigInt(t) > round.plan.contractPlan.validUntil) {
    return transition(round, "PLAN_STALE", "approval window closed before settlement");
  }
  const lastStep = round.history.at(-1)?.at ?? 0;
  const pending = round.state === "SETTLING" || ((round.state === "SETTLED" || round.state === "VERIFYING") && t - lastStep > RESUME_AFTER_SEC);
  if (pending) {
    log("settlement.resume", { round: round.id, state: round.state, idleSec: t - lastStep });
    try {
      return await completeSettlement(round);
    } catch (error) {
      // Readers still get the round; the next read retries. The failure is logged with the round id.
      log("settlement.resume_failed", { round: round.id, state: round.state, error: (error as Error).message.split("\n")[0] }, "error");
      return getRound(round.id);
    }
  }
  return round;
}

async function solve(round: RoundRecord, reason: string): Promise<RoundRecord> {
  const circle = await getCircle(round.circleId);
  const entries = await intentsFor(round.id);
  if (entries.length === 0) return transition(round, "EXPIRED", "no member signed an intent");
  let r = await transition(round, "FROZEN", reason);
  if (r.state !== "FROZEN") return r;
  r = await transition(r, "SOLVING");
  if (entries.length < circle.minParticipants) {
    return transition(r, "INSUFFICIENT_PARTICIPANTS", `${entries.length} signed, circle needs ${circle.minParticipants}`);
  }
  const u = await universe();
  const tokens = new Map<AssetUid, Address>(priceable(u.registry, u.feeds).filter(({ token }) => circle.assetUids.includes(token.uid)).map(({ token }) => [token.uid as AssetUid, token.contractAddress]));
  const t = now();
  const match = matchRound({ roundId: r.id, snapshot: r.snapshot, intents: entries.map((e) => e.intent), universe: tokens, nowSec: t });
  const matchJson = toJson(match);
  if (match.status === "PLAN_STALE") return transition(r, "PLAN_STALE", match.statusReasons.join("; "), { match: matchJson });
  if (match.status === "INSUFFICIENT_PARTICIPANTS") return transition(r, "INSUFFICIENT_PARTICIPANTS", match.statusReasons.join("; "), { match: matchJson });
  for (const e of entries) await logActivity(e.owner, "ROUND_MATCHED", { status: match.status, circle: circle.name }, { roundId: r.id, circleId: r.circleId });
  if (match.status === "NO_CROSS") return transition(r, "NO_CROSS", "no crossing flow exists among the signed intents", { match: matchJson });
  const plan = buildSettlementPlan(match, { settlementContract: r.settlementContract, validAfter: t - 60, validUntil: t + APPROVAL_WINDOW_SEC, generatedAt: t });
  return transition(r, "PROPOSED", `${match.status}: ${match.legs.length} legs`, { match: matchJson, plan: toJson(plan) });
}

/** Organizer closes collection early (for example once the expected members have signed). */
export async function closeCollection(roundId: string, organizer: Address): Promise<RoundRecord> {
  const round = await getRound(roundId);
  if ((await membership(round.circleId, organizer)) !== "ORGANIZER") throw new RoundError("Only the organizer can close collection early.");
  if (round.state !== "OPEN" && round.state !== "COLLECTING") throw new RoundError(`Round is ${round.state}, collection is already closed.`);
  return solve(round, "organizer closed collection");
}

type PreparedIntent = { intent: PortfolioIntent; rows: Array<{ symbol: string; side: "SELL" | "BUY"; amountTokens: number; valueUsd: number }>; outsideCircle: string[]; warnings: string[] };

const e18 = (v: bigint) => Number(v / 10n ** 12n) / 1e6;

/**
 * Builds the viewer's unsigned intent for this round from their saved target, their live balances and the round's
 * snapshot prices. Only the circle's assets enter the intent; drift in other assets is reported, not traded.
 */
export async function prepareIntent(roundId: string, owner: Address): Promise<PreparedIntent> {
  const round = await getRound(roundId);
  if (round.state !== "OPEN" && round.state !== "COLLECTING") throw new RoundError(`Round is ${round.state}, it no longer accepts intents.`);
  if (!(await membership(round.circleId, owner))) throw new RoundError("Join this circle first.");
  const target = await getTarget(owner);
  if (!target) throw new RoundError("Set a target portfolio before joining a round.");
  const portfolio = await loadPortfolio(owner);
  if (!portfolio.ok) throw new RoundError(`Could not read your wallet: ${portfolio.detail}`);
  if (portfolio.positions.length === 0) throw new RoundError("This wallet holds no Stock Tokens yet, so there is nothing to rebalance.");
  const circle = await getCircle(round.circleId);
  const { registry } = await universe();

  const snapshotPrices = priceMap(round.snapshot);
  const prices = new Map<AssetUid, bigint>(portfolio.positions.map((p) => [p.uid as AssetUid, snapshotPrices.get(p.uid as AssetUid) ?? BigInt(p.priceE18)]));
  for (const [uid, price] of snapshotPrices) prices.set(uid, price);
  const priced = new Set(registry.all().filter((t) => prices.has(t.uid as AssetUid)).map((t) => t.symbol));
  const unpriced = target.weights.map((w) => w.symbol).filter((s) => !priced.has(s));
  if (unpriced.length) for (const [uid, price] of await livePricesBySymbol(unpriced)) prices.set(uid as AssetUid, price);
  const holdings: Holding[] = portfolio.positions.map((p) => ({ owner, assetUid: p.uid as AssetUid, token: p.token, rawBalance: BigInt(p.rawBalance) }));
  const spec = specFromTarget(target);
  const t = now();
  const policy: ExecutionPolicy = { maxExternalSlippageBps: target.maxExternalCostBps, maxReferencePriceDriftBps: 100, maxRoundDurationSec: circle.durationSec, allowPartialCross: true, allowMarketResidual: true, allowLimitResidual: true, allowTwapResidual: true, allowWaitResidual: true, urgency: "NORMAL", validUntil: round.freezesAt + APPROVAL_WINDOW_SEC };
  const resolved = resolveGoal(spec, { owner, holdings, registry, prices, nowSec: t, maxRegistryAgeSec: 3_600 }, policy);
  if (!resolved.ok) throw new RoundError(resolved.problems.map((p) => p.detail).join(" "));
  const preview = resolved.preview;
  const inCircle = new Set(circle.assetUids);
  const limits = preview.limits.filter((l) => inCircle.has(l.assetUid));
  const symbolOf = new Map(preview.tokens.map((x) => [x.uid, x.symbol]));
  const outsideCircle = preview.limits.filter((l) => !inCircle.has(l.assetUid)).map((l) => symbolOf.get(l.assetUid) ?? l.assetUid);
  if (limits.length === 0) throw new RoundError(`Your target does not change any asset this circle trades (${circle.assetSymbols.join(", ")}).`);

  const intent = intentFromPreview({ ...preview, limits }, {
    circleId: round.circleId,
    roundId: round.id,
    valuationSnapshotHash: round.snapshotHash,
    agent: owner,
    nonce: BigInt(t),
    validAfter: round.opensAt - 60,
    validUntil: round.freezesAt + APPROVAL_WINDOW_SEC,
  });
  const rows = limits.map((l) => {
    const sell = l.maxOutRaw > 0n;
    const raw = sell ? l.maxOutRaw : l.maxInRaw;
    return { symbol: symbolOf.get(l.assetUid) ?? "?", side: sell ? ("SELL" as const) : ("BUY" as const), amountTokens: Number(raw / 10n ** 9n) / 1e9, valueUsd: e18((raw * (prices.get(l.assetUid) ?? 0n)) / 10n ** 18n) };
  });
  return { intent, rows, outsideCircle, warnings: preview.warnings };
}

export function intentSigningPayload(intent: PortfolioIntent, contract: Address) {
  return intentTypedData(intent, contract);
}

/** Accepts a signed intent. The signature is checked against the round's settlement domain before anything is stored. */
export async function submitIntent(roundId: string, owner: Address, intent: PortfolioIntent, signature: Hex): Promise<"ACCEPTED" | "REPLACED" | "UNCHANGED"> {
  const round = await getRound(roundId);
  const circle = await getCircle(round.circleId);
  if (round.state !== "OPEN" && round.state !== "COLLECTING") throw new RoundError(`Round is ${round.state}, it no longer accepts intents.`);
  if (now() >= round.freezesAt) throw new RoundError("The collection window has closed.");
  if (!(await membership(circle.id, owner))) throw new RoundError("Only circle members can sign into this round.");
  if (getAddress(intent.owner) !== getAddress(owner)) throw new RoundError("The intent owner must be the signed-in wallet.");
  if (intent.roundId !== round.id || intent.circleId !== round.circleId) throw new RoundError("This intent is bound to a different round.");
  if (intent.valuationSnapshotHash !== round.snapshotHash) throw new RoundError("This intent was priced against a different snapshot.");
  for (const l of intent.assets) if (!circle.assetUids.includes(l.assetUid)) throw new RoundError(`${l.assetUid} is outside this circle's assets.`);
  const signer = await verifyIntentSignature(intent, signature, round.settlementContract);
  if (getAddress(signer) !== getAddress(owner)) throw new RoundError("The signature does not belong to this wallet.");

  const d = await db();
  const intentHash = keccak256(stringToHex(toJson(intent)));
  const existing = await d.query<{ intent_hash: string }>("select intent_hash from intents where round_id = $1 and owner = $2", [round.id, key(owner)]);
  if (existing[0]?.intent_hash === intentHash) return "UNCHANGED";
  await d.query(
    `insert into intents (round_id, owner, intent, signature, intent_hash) values ($1, $2, $3::text::jsonb, $4, $5)
     on conflict (round_id, owner) do update set intent = excluded.intent, signature = excluded.signature, intent_hash = excluded.intent_hash, submitted_at = now()`,
    [round.id, key(owner), toJson(intent), signature, intentHash],
  );
  await d.query("update residual_decisions set consumed_round_id = $1 where owner = $2 and user_choice = 'CARRY_FORWARD' and consumed_round_id is null and round_id in (select id from rounds where circle_id = $3)", [round.id, key(owner), round.circleId]);
  if (round.state === "OPEN") await transition(round, "COLLECTING", "first intent signed");
  await logActivity(owner, "INTENT_SIGNED", { circle: circle.name, sequence: round.sequence }, { roundId: round.id, circleId: round.circleId });
  return existing.length ? "REPLACED" : "ACCEPTED";
}

export async function approvalsFor(roundId: string): Promise<Map<Address, { nonce: bigint; signature: Hex }>> {
  const rows = await (await db()).query<{ participant: string; nonce: string; signature: string }>("select * from approvals where round_id = $1", [roundId]);
  return new Map(rows.map((r) => [getAddress(r.participant), { nonce: BigInt(r.nonce), signature: r.signature as Hex }]));
}

export function approvalPayload(plan: SettlementPlan, participant: Address) {
  const nonce = approvalNonce(plan.planHash, participant);
  return { nonce, typedData: approvalTypedData(plan, participant, nonce) };
}

/** Records one participant's EIP-712 approval of the exact plan. The last approval makes the round ready to settle. */
export async function submitApproval(roundId: string, participant: Address, signature: Hex): Promise<RoundRecord> {
  let round = await advance(await getRound(roundId));
  if (!round.plan) throw new RoundError("This round has no plan to approve.");
  if (round.state !== "PROPOSED" && round.state !== "APPROVING") throw new RoundError(`Round is ${round.state}, approvals are closed.`);
  const plan = round.plan;
  if (!plan.contractPlan.participants.some((p) => getAddress(p) === getAddress(participant))) throw new RoundError("Your wallet is not part of this plan.");
  const { nonce, typedData } = approvalPayload(plan, participant);
  const valid = await client().verifyTypedData({ address: participant, signature, ...typedData });
  if (!valid) throw new RoundError("That signature does not approve this exact plan.");
  const inserted = await (await db()).query("insert into approvals (round_id, participant, nonce, signature) values ($1, $2, $3, $4) on conflict (round_id, participant) do nothing returning participant", [round.id, key(participant), nonce.toString(), signature]);
  if (inserted.length > 0) await logActivity(participant, "PLAN_APPROVED", { planHash: plan.planHash }, { roundId: round.id, circleId: round.circleId });
  if (round.state === "PROPOSED") round = await transition(round, "APPROVING", "first approval");
  const approvals = await approvalsFor(round.id);
  if (plan.contractPlan.participants.every((p) => approvals.has(getAddress(p)))) round = await transition(round, "READY_TO_SETTLE", "every participant approved");
  return round;
}

/** What the viewer must still do onchain before settle(): allowances for their own outflows, read live. */
export async function allowanceStatus(round: RoundRecord, owner: Address) {
  if (!round.plan) return [];
  const needs = [...requiredOutflows(round.plan)].filter(([k]) => k.startsWith(owner.toLowerCase()));
  const rpc = client();
  return Promise.all(
    needs.map(async ([k, amount]) => {
      const token = getAddress(k.split("|")[1] as string);
      const [allowance, balance] = await Promise.all([
        rpc.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, round.settlementContract] }),
        rpc.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
      ]);
      return { token, amount, allowance, balance, sufficient: allowance >= amount, funded: balance >= amount };
    }),
  );
}

/** The settle() call any participant can send once every approval is in. The server never holds user keys. */
export async function settleCall(round: RoundRecord): Promise<{ to: Address; data: Hex }> {
  if (round.state !== "READY_TO_SETTLE" || !round.plan) throw new RoundError(`Round is ${round.state}, not ready to settle.`);
  const approvals = await approvalsFor(round.id);
  const ordered = round.plan.contractPlan.participants.map((p) => approvals.get(getAddress(p)) as { nonce: bigint; signature: Hex });
  return { to: round.settlementContract, data: encodeFunctionData({ abi: venue0SettlementAbi, functionName: "settle", args: [round.plan.contractPlan, ordered] }) };
}

/**
 * Records a settlement transaction a participant sent, then verifies it from chain data alone on an independent RPC.
 * The receipt, calldata, logs and balance deltas decide the round's final state, not the caller.
 */
export async function recordSettlement(roundId: string, reporter: Address, txHash: Hex): Promise<RoundRecord> {
  let round = await getRound(roundId);
  if (!round.plan) throw new RoundError("This round has no plan to settle.");
  if (!round.plan.contractPlan.participants.some((p) => getAddress(p) === getAddress(reporter))) throw new RoundError("Only participants in the plan can report its settlement.");
  if (round.state === "READY_TO_SETTLE") {
    await assertSettlesPlan(round, txHash);
    round = await transition(round, "SETTLING", "settlement tx sent by a participant", { settlement_tx: txHash });
    log("settlement.reported", { round: round.id, tx: txHash, reporter });
  }
  return completeSettlement(round);
}

/**
 * Carries a reported settlement to its final state: receipt, then independent verification. Safe to call repeatedly
 * and from any request: each step is a compare-and-set, so a request that dies mid-way is resumed by the next one.
 */
async function completeSettlement(start: RoundRecord): Promise<RoundRecord> {
  let round = start;
  if (!round.settlementTx || !round.plan) return round;
  const tx = round.settlementTx;
  if (round.state === "SETTLING") {
    // One non-blocking receipt read per request. Waiting inline could outlive the edge's idle-connection limit and
    // cancel the request; the execute page polls, so an unmined tx is simply picked up by the next poll.
    const receipt = await client().getTransactionReceipt({ hash: tx }).catch(() => null);
    if (!receipt) return round;
    if (receipt.status !== "success") return transition(round, "SETTLEMENT_REVERTED", `tx ${tx} reverted`);
    round = await transition(round, "SETTLED", `block ${receipt.blockNumber}`);
    if (round.state !== "SETTLED") return round;
  }
  if (round.state === "SETTLED") round = await transition(round, "VERIFYING");
  if (round.state !== "VERIFYING") return round;
  const approvals = await approvalsFor(round.id);
  const plan = round.plan as SettlementPlan;
  const input = {
    txHash: tx,
    settlementContract: round.settlementContract,
    plan: plan.contractPlan,
    nonces: new Map([...approvals].map(([a, v]) => [a, v.nonce])),
    watchTokens: [...new Set(plan.contractPlan.legs.map((l) => l.token))],
  };
  // The independent verifier RPC may lack historical state (the public RPC prunes after roughly 40 minutes). Then the
  // check reruns on the executor RPC and the record says so; independence is never claimed for that run.
  let verifierRpc: { client: PublicClient; providers: Providers } = verifierClient();
  let verification: SettlementVerification;
  try {
    verification = await verifySettlement(verifierRpc.client, input);
  } catch (error) {
    const reason = (error as Error).message.split("\n")[0] ?? "verifier RPC error";
    log("settlement.verifier_fallback", { round: round.id, tx, verifier: verifierRpc.providers.verifier, reason }, "warn");
    verifierRpc = { client: client(), providers: { executor: verifierRpc.providers.executor, verifier: verifierRpc.providers.executor, independent: false, fallbackReason: `independent RPC ${verifierRpc.providers.verifier} failed: ${reason}` } };
    verification = await verifySettlement(verifierRpc.client, input);
  }
  // The set of wallets whose approval nonce the contract consumed must be exactly the plan's participants.
  const consumed = new Set(verification.checks.filter((c) => c.name.startsWith("event.NonceConsumed.") && c.status === "PASS").map((c) => c.name.slice("event.NonceConsumed.".length).toLowerCase()));
  const expected = plan.contractPlan.participants.map((p) => p.toLowerCase());
  const participantsMatch = consumed.size === expected.length && expected.every((p) => consumed.has(p));
  verification.checks.push({ name: "participants.set", status: participantsMatch ? "PASS" : "FAIL", detail: `${consumed.size} approvals consumed onchain for ${expected.length} plan participants` });
  if (!participantsMatch) verification.status = "FAIL";
  const final = verification.status === "PASS" ? "COMPLETE" : "VERIFICATION_FAILED";
  log("settlement.verified", { round: round.id, tx, status: verification.status, failed: verification.checks.filter((c) => c.status !== "PASS").map((c) => c.name), ...verifierRpc.providers });
  const done = await transition(round, final, `verifier ${verification.status}`, { verification: toJson({ ...verification, providers: verifierRpc.providers }) });
  if (done.state === final && done.verification) {
    for (const p of plan.contractPlan.participants) await logActivity(p, "SETTLED", { txHash: tx, verifier: verification.status }, { roundId: round.id, circleId: round.circleId });
  }
  return done;
}

/**
 * A reported hash must be a call to this round's settlement contract whose settle() argument is exactly this round's
 * plan. Otherwise any member could post an unrelated successful transaction and fail the round's verification.
 */
async function assertSettlesPlan(round: RoundRecord, txHash: Hex) {
  const plan = round.plan as SettlementPlan;
  const tx = await client().getTransaction({ hash: txHash }).catch(() => undefined);
  if (!tx) throw new RoundError("That transaction was not found on Robinhood Chain.");
  if (tx.chainId !== undefined && tx.chainId !== 4663) throw new RoundError(`That transaction is on chain ${tx.chainId}, not Robinhood Chain 4663.`);
  if (!tx.to || getAddress(tx.to) !== getAddress(round.settlementContract)) throw new RoundError("That transaction is not a call to this round's settlement contract.");
  const call = decodeFunctionData({ abi: venue0SettlementAbi, data: tx.input });
  if (call.functionName !== "settle" || hashContractPlan((call.args as readonly [ContractPlan, unknown])[0]) !== plan.planHash) throw new RoundError("That transaction settles a different plan.");
}

/** Reads a user's settlement-relevant role in a round. Other members' fills are never returned. */
export function ownFills(round: RoundRecord, owner: Address) {
  return (round.match?.fills ?? []).filter((f) => getAddress(f.owner) === getAddress(owner));
}

export function ownLegs(round: RoundRecord, owner: Address) {
  return (round.plan?.legs ?? []).filter((l) => getAddress(l.from) === getAddress(owner) || getAddress(l.to) === getAddress(owner));
}

export { TERMINAL };
