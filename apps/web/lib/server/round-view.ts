import "server-only";
import { getAddress, type Address } from "viem";
import { priceMap } from "@venue0/portfolio";
import type { Round as GraphRound } from "@/lib/data";
import { getCircle, membership } from "./circles";
import { universe } from "./portfolio";
import { decisionsFor, recommend, residualItems, residualsReady } from "./residuals";
import { advance, allowanceStatus, approvalsFor, getRound, intentsFor, ownFills, RoundError, TERMINAL, type RoundRecord } from "./rounds";

const e18 = (v: bigint) => Number(v / 10n ** 12n) / 1e6;
const tokens = (raw: bigint) => Number(raw / 10n ** 9n) / 1e9;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Everything one member may see about a round: their own intent, fills, legs and residual, plus aggregate totals.
 * Other members appear only as "Member 2", "Member 3", and only in circles whose privacy mode shares deltas.
 */
export async function roundView(roundId: string, viewer: Address) {
  const stored = await getRound(roundId);
  const role = await membership(stored.circleId, viewer);
  if (!role) throw new RoundError("Only members of this circle can open its rounds.");
  const round = await advance(stored);
  const circle = await getCircle(round.circleId);
  const { registry } = await universe();
  const symbol = (uid: string) => registry.getByUid(uid).symbol;
  const prices = priceMap(round.snapshot);

  const entries = await intentsFor(round.id);
  const mine = entries.find((e) => same(e.owner, viewer));
  const labelOf = new Map<string, string>();
  labelOf.set(viewer.toLowerCase(), "You");
  entries.filter((e) => !same(e.owner, viewer)).forEach((e, i) => labelOf.set(e.owner.toLowerCase(), `Member ${i + 2}`));
  const label = (a: string) => labelOf.get(a.toLowerCase()) ?? "Member";
  const members = new Set(entries.map((e) => e.owner.toLowerCase()));
  const pseudonymize = (text: string) => text.replace(/0x[0-9a-fA-F]{40}/g, (a) => (members.has(a.toLowerCase()) ? label(a) : a));

  const intentRows = (intent: (typeof entries)[number]["intent"]) =>
    intent.assets.map((l) => {
      const sell = l.maxOutRaw > 0n;
      const raw = sell ? l.maxOutRaw : l.maxInRaw;
      return { symbol: symbol(l.assetUid), side: sell ? ("SELL" as const) : ("BUY" as const), amountTokens: tokens(raw), valueUsd: e18((raw * (prices.get(l.assetUid) ?? 0n)) / 10n ** 18n) };
    });

  const fills = ownFills(round, viewer).map((f) => ({ symbol: symbol(f.assetUid), side: f.side, requestedUsd: e18(f.requestedValueUsdE18), crossedUsd: e18(f.crossedValueUsdE18), residualUsd: e18(f.residualValueUsdE18), crossedTokens: tokens(f.crossedRaw), residualTokens: tokens(f.residualRaw), residualClass: f.residualClass }));
  const legs = (round.plan?.legs ?? [])
    .filter((l) => same(l.from, viewer) || same(l.to, viewer))
    .map((l) => ({ direction: same(l.from, viewer) ? ("SEND" as const) : ("RECEIVE" as const), counterparty: label(same(l.from, viewer) ? l.to : l.from), symbol: symbol(l.assetUid), amountTokens: tokens(l.amount), valueUsd: e18((l.amount * (prices.get(l.assetUid) ?? 0n)) / 10n ** 18n) }));

  const inPlan = Boolean(round.plan?.contractPlan.participants.some((p) => same(p, viewer)));
  const approvals = await approvalsFor(round.id);
  const allowances = inPlan && (round.state === "PROPOSED" || round.state === "APPROVING" || round.state === "READY_TO_SETTLE") ? await allowanceStatus(round, viewer) : [];
  const ready = residualsReady(round);
  const residual = mine && ready ? await residualItems(round, viewer) : [];
  const decisions = mine ? await decisionsFor(round.id, viewer) : [];
  const recommendation = mine && ready && residual.some((r) => !r.dust) && decisions.length === 0 ? await recommend(round, viewer).catch((error: unknown) => ({ pair: null, plan: null, quote: null, unavailable: `Could not price the residual right now: ${(error as Error).message.split("\n")[0]}` })) : null;
  const totals = round.match?.totals;

  return {
    round: {
      id: round.id,
      sequence: round.sequence,
      state: round.state,
      terminal: TERMINAL.has(round.state),
      opensAt: round.opensAt,
      freezesAt: round.freezesAt,
      snapshotCapturedAt: round.snapshot.capturedAt,
      snapshotHash: round.snapshotHash,
      prices: round.snapshot.prices.map((p) => ({ symbol: symbol(p.assetUid), priceUsd: e18(p.priceUsdE18) })),
      settlementContract: round.settlementContract,
      settlementTx: round.settlementTx,
      planHash: round.plan?.planHash ?? null,
      planValidUntil: round.plan ? Number(round.plan.contractPlan.validUntil) : null,
      history: round.history.map((h) => ({ ...h, reason: h.reason?.replace(/0x[0-9a-fA-F]{40}/g, "a participant") ?? null })),
      verification: round.verification ? { status: round.verification.status, blockNumber: round.verification.blockNumber ?? null, checks: round.verification.checks.map((c) => ({ ...c, name: pseudonymize(c.name), detail: pseudonymize(c.detail) })), verifiedAt: round.verification.verifiedAt } : null,
    },
    circle: { id: circle.id, name: circle.name, assetSymbols: circle.assetSymbols, minParticipants: circle.minParticipants, memberCount: circle.memberCount, durationSec: circle.durationSec, residualBehavior: circle.residualBehavior, privacyMode: circle.privacyMode, isOrganizer: role === "ORGANIZER" },
    you: {
      signed: Boolean(mine),
      intent: mine ? intentRows(mine.intent) : [],
      fills,
      legs,
      inPlan,
      approved: approvals.has(getAddress(viewer)),
      allowances: allowances.map((a) => ({ token: a.token, symbol: registry.requireCanonicalAddress(a.token).symbol, amountRaw: a.amount, amountTokens: tokens(a.amount), sufficient: a.sufficient, funded: a.funded })),
      residual: residual.map((r) => ({ symbol: r.symbol, side: r.side, amountTokens: tokens(r.amountRaw), valueUsd: r.valueUsd, dust: r.dust })),
      recommendation: recommendation && { decision: recommendation.plan?.decision ?? null, reasons: recommendation.plan?.reasons ?? [], quote: recommendation.quote, unavailable: recommendation.unavailable, canExecute: Boolean(recommendation.pair && recommendation.quote), sell: recommendation.pair ? { symbol: recommendation.pair.sell.symbol, amountTokens: tokens(recommendation.pair.sell.amountRaw) } : null, buy: recommendation.pair ? { symbol: recommendation.pair.buy.symbol, amountTokens: tokens(recommendation.pair.buy.amountRaw) } : null, buyOutTokens: recommendation.quote ? tokens(BigInt(recommendation.quote.amountOut)) : null },
      decisions,
    },
    aggregate: {
      signed: entries.length,
      participants: round.plan?.contractPlan.participants.length ?? 0,
      approvals: approvals.size,
      requestedUsd: totals ? e18(totals.requestedNotionalUsdE18) : 0,
      crossedUsd: totals ? e18(totals.crossedNotionalUsdE18) : 0,
      residualUsd: totals ? e18(totals.residualNotionalUsdE18) : 0,
      crossRateBps: totals ? Number(totals.crossRateBps) : 0,
      legCount: round.plan?.legs.length ?? 0,
      cycleCount: round.match?.cycles.length ?? 0,
      status: round.match?.status ?? null,
    },
    graph: circle.privacyMode === "DELTAS_ONLY" && round.match && round.match.legs.length > 0 ? graphFor(round, entries, label, symbol, prices) : null,
  };
}

export type RoundViewData = Awaited<ReturnType<typeof roundView>>;

/** Shapes a live round for the CrossingGraph component, with members anonymized. */
function graphFor(round: RoundRecord, entries: Awaited<ReturnType<typeof intentsFor>>, label: (a: string) => string, symbol: (uid: string) => string, prices: Map<string, bigint>): GraphRound {
  const match = round.match as NonNullable<RoundRecord["match"]>;
  // Graph nodes are keyed by label, never by address: the browser of one member must not learn another member's wallet.
  const id = (a: string) => label(a);
  const value = (uid: string, raw: bigint) => e18((raw * (prices.get(uid) ?? 0n)) / 10n ** 18n);
  return {
    key: round.id,
    gate: `Round ${round.sequence}`,
    description: "",
    environment: "ROBINHOOD_CHAIN_MAINNET",
    evidencePath: "",
    roundId: round.id,
    status: match.status,
    result: round.state,
    capturedAt: new Date(round.snapshot.capturedAt * 1000).toISOString(),
    snapshot: { hash: round.snapshotHash, source: round.snapshot.source },
    assets: [],
    participants: entries.map((e) => ({
      address: id(e.owner),
      label: label(e.owner),
      kind: "member",
      valueUsd: null,
      allocationErrorBeforeBps: null,
      allocationErrorAfterBps: null,
      intent: e.intent.assets.map((l) => ({ symbol: symbol(l.assetUid), side: l.maxOutRaw > 0n ? ("SELL" as const) : ("BUY" as const), amountTokens: tokens(l.maxOutRaw + l.maxInRaw), valueUsd: value(l.assetUid, l.maxOutRaw + l.maxInRaw) })),
      signature: null,
      policy: {},
    })),
    legs: match.legs.map((l) => ({ from: id(l.from), to: id(l.to), symbol: symbol(l.assetUid), amountTokens: tokens(l.amountRaw), valueUsd: e18(l.valueUsdE18) })),
    fills: [],
    cycles: match.cycles.map((c) => c.map((h) => ({ from: id(h.from), to: id(h.to), symbol: symbol(h.assetUid) }))),
    totals: { requestedUsd: e18(match.totals.requestedNotionalUsdE18), crossedUsd: e18(match.totals.crossedNotionalUsdE18), residualUsd: e18(match.totals.residualNotionalUsdE18), dustUsd: e18(match.totals.dustResidualNotionalUsdE18), transferUsd: e18(match.totals.transferNotionalUsdE18), crossRateBps: Number(match.totals.crossRateBps), externalResidualCount: match.totals.externalResidualCount },
    comparison: { marketOnly: { externalOrders: 0, crossedUsd: 0 }, pairwise: { crossedUsd: 0, transfers: [], method: "" }, venue0: { crossedUsd: e18(match.totals.crossedNotionalUsdE18), externalOrders: match.totals.externalResidualCount } },
    plan: null,
    settlement: null,
    verifier: null,
    independentVerification: [],
  };
}
