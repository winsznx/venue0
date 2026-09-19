import "server-only";
import { erc20Abi, getAddress, type Address, type Hex } from "viem";
import { decideResidual, routeCost, usEquitySession, type ResidualPlan, type RouteCostEstimate } from "@venue0/residual";
import { priceMap } from "@venue0/portfolio";
import { NO_ROUTE_CODES, UniswapApiError, UniswapTradingApi, type PermitData, type QuoteResponse, type TransactionRequest } from "@venue0/uniswap";
import type { AssetUid } from "@venue0/shared";
import { db, fromJson, toJson } from "./db/client";
import { client, universe } from "./portfolio";
import { intentsFor, ownFills, RoundError, type RoundRecord } from "./rounds";
import { key, logActivity } from "./users";

export type ResidualChoice = "CARRY_FORWARD" | "EXECUTE_NOW" | "CANCEL";

export type ResidualItem = { assetUid: AssetUid; token: Address; symbol: string; side: "SELL" | "BUY"; amountRaw: bigint; valueUsd: number; dust: boolean };

const SLIPPAGE_PCT = 2.5;
const e18 = (v: bigint) => Number(v / 10n ** 12n) / 1e6;

/** Residuals are only known once the matcher ran. NO_CROSS rounds leave the whole request as residual. */
export async function residualItems(round: RoundRecord, owner: Address): Promise<ResidualItem[]> {
  const { registry } = await universe();
  return ownFills(round, owner)
    .filter((f) => f.residualRaw > 0n)
    .map((f) => ({ assetUid: f.assetUid, token: f.token, symbol: registry.getByUid(f.assetUid).symbol, side: f.side, amountRaw: f.residualRaw, valueUsd: e18(f.residualValueUsdE18), dust: f.residualClass === "DUST" }));
}

/** A round's residual is settled for the user once crossing is final (or nothing crossed). */
export function residualsReady(round: RoundRecord): boolean {
  return round.state === "COMPLETE" || round.state === "NO_CROSS";
}

export type Recommendation = {
  pair: { sell: ResidualItem; buy: ResidualItem } | null;
  plan: ResidualPlan | null;
  quote: { amountOut: string; routeString: string | null; requestId: string } | null;
  unavailable: string | null;
};

function api(): UniswapTradingApi | undefined {
  return process.env.UNISWAP_API_KEY ? new UniswapTradingApi(process.env.UNISWAP_API_KEY) : undefined;
}

/**
 * Runs the economic residual engine on the viewer's own residual. The external route is priced from a live Uniswap
 * quote for the exact residual pair (sell leftover into buy leftover), measured against the round's snapshot prices.
 */
export async function recommend(round: RoundRecord, owner: Address): Promise<Recommendation> {
  const items = (await residualItems(round, owner)).filter((i) => !i.dust);
  const sell = items.find((i) => i.side === "SELL");
  const buy = items.find((i) => i.side === "BUY");
  if (!sell || !buy) return { pair: null, plan: null, quote: null, unavailable: items.length === 0 ? null : "Only one side of your residual is left, and V1 routes Stock Token to Stock Token, so it can only carry forward or be cancelled." };
  const uniswap = api();
  if (!uniswap) return { pair: { sell, buy }, plan: null, quote: null, unavailable: "Uniswap is not configured on this server." };

  const intent = (await intentsFor(round.id)).find((e) => getAddress(e.owner) === getAddress(owner))?.intent;
  if (!intent) throw new RoundError("No intent from this wallet in the round.");
  const prices = priceMap(round.snapshot);
  const referenceInUsd = e18((sell.amountRaw * (prices.get(sell.assetUid) ?? 0n)) / 10n ** 18n);
  const observedAt = new Date().toISOString();
  const routes: RouteCostEstimate[] = [];
  let quote: Recommendation["quote"] = null;
  try {
    const q = await uniswap.quote({ tokenIn: sell.token, tokenOut: buy.token, amount: sell.amountRaw, swapper: owner, slippageTolerance: SLIPPAGE_PCT });
    const out = BigInt(q.quote.output?.amount ?? "0");
    const gas = Number((q.quote as { gasFeeUSD?: string }).gasFeeUSD ?? 0);
    routes.push(routeCost({ venue: "UNISWAP", style: "MARKET", referenceInUsd, referenceOutUsd: e18((out * (prices.get(buy.assetUid) ?? 0n)) / 10n ** 18n), providerFeeUsd: null, networkCostUsd: gas, fixedCostUsd: gas, source: `uniswap quote ${q.requestId}`, observedAt }));
    quote = { amountOut: out.toString(), routeString: q.quote.routeString ?? null, requestId: q.requestId };
  } catch (error) {
    if (!(error instanceof UniswapApiError && (NO_ROUTE_CODES.has(error.error.errorCode) || error.error.status === 404))) throw error;
  }
  const { registry } = await universe();
  const plan = decideResidual(
    { urgency: intent.policy.urgency, maxExternalSlippageBps: intent.policy.maxExternalSlippageBps, maxReferencePriceDriftBps: intent.policy.maxReferencePriceDriftBps, allowMarketResidual: intent.policy.allowMarketResidual, allowLimitResidual: false, allowTwapResidual: false, allowWaitResidual: intent.policy.allowWaitResidual },
    { notionalUsd: referenceInUsd, session: usEquitySession(new Date()), capabilities: registry.getByUid(sell.assetUid).tradingCapabilities, tradingHalt: false, referenceDriftBps: 0, routes, twapThresholdUsd: 1_000, nextRoundAvailable: true },
  );
  return { pair: { sell, buy }, plan, quote, unavailable: null };
}

export type StoredDecision = { assetUid: string; side: string; amountRaw: string; engineDecision: string; userChoice: ResidualChoice; detail: Record<string, unknown>; consumedRoundId: string | null };

export async function decisionsFor(roundId: string, owner: Address): Promise<StoredDecision[]> {
  const rows = await (await db()).query<{ asset_uid: string; side: string; amount_raw: string; engine_decision: string; user_choice: string; detail: unknown; consumed_round_id: string | null }>("select * from residual_decisions where round_id = $1 and owner = $2", [roundId, key(owner)]);
  return rows.map((r) => ({ assetUid: r.asset_uid, side: r.side, amountRaw: r.amount_raw, engineDecision: r.engine_decision, userChoice: r.user_choice as ResidualChoice, detail: fromJson(r.detail), consumedRoundId: r.consumed_round_id }));
}

/** Residuals carried forward from earlier rounds of this circle that the viewer has not yet re-signed. */
export async function carriedInto(circleId: string, owner: Address) {
  return (await db()).query<{ round_id: string; asset_uid: string; side: string; amount_raw: string }>(
    "select d.round_id, d.asset_uid, d.side, d.amount_raw from residual_decisions d join rounds r on r.id = d.round_id where r.circle_id = $1 and d.owner = $2 and d.user_choice = 'CARRY_FORWARD' and d.consumed_round_id is null",
    [circleId, key(owner)],
  );
}

async function store(round: RoundRecord, owner: Address, items: ResidualItem[], engineDecision: string, choice: ResidualChoice, detail: Record<string, unknown>) {
  const d = await db();
  for (const i of items) {
    await d.query(
      `insert into residual_decisions (round_id, owner, asset_uid, side, amount_raw, engine_decision, user_choice, detail) values ($1, $2, $3, $4, $5, $6, $7, $8::text::jsonb)
       on conflict (round_id, owner, asset_uid) do update set user_choice = excluded.user_choice, engine_decision = excluded.engine_decision, detail = excluded.detail, decided_at = now()`,
      [round.id, key(owner), i.assetUid, i.side, i.amountRaw.toString(), engineDecision, choice, toJson(detail)],
    );
  }
}

/** Carry forward or cancel. Carried residuals come back automatically: the next round rebuilds the intent from the same target. */
export async function decide(round: RoundRecord, owner: Address, choice: Exclude<ResidualChoice, "EXECUTE_NOW">, engineDecision: string) {
  if (!residualsReady(round)) throw new RoundError("Residuals are decided after the round settles.");
  const items = await residualItems(round, owner);
  if (items.length === 0) throw new RoundError("You have no residual in this round.");
  await store(round, owner, items, engineDecision, choice, {});
  await logActivity(owner, "RESIDUAL_DECIDED", { choice, assets: items.map((i) => `${i.side} ${i.symbol}`) }, { roundId: round.id, circleId: round.circleId });
}

/** Quotes live in the database, not process memory: consecutive steps of one swap may run on different server instances. */
const QUOTE_TTL_SEC = 60;

/**
 * Step one of a residual swap from the user's own wallet: returns the token approval to send first, if Uniswap needs
 * one, otherwise a fresh quote and the Permit2 data to sign. Mirrors executeResidualSwap (packages/uniswap) step by step.
 */
export async function swapPrepare(round: RoundRecord, owner: Address): Promise<{ approval: TransactionRequest | null; permitData: PermitData; amountOut: string | null; minimumOut: string | null }> {
  if (!residualsReady(round)) throw new RoundError("Residuals are executed after the round settles.");
  const rec = await recommend(round, owner);
  if (!rec.pair) throw new RoundError(rec.unavailable ?? "No residual pair to execute.");
  const uniswap = api() as UniswapTradingApi;
  const approval = await uniswap.checkApproval(owner, rec.pair.sell.token, rec.pair.sell.amountRaw);
  if (approval.approval) return { approval: approval.approval, permitData: null, amountOut: null, minimumOut: null };
  const quote = await uniswap.quote({ tokenIn: rec.pair.sell.token, tokenOut: rec.pair.buy.token, amount: rec.pair.sell.amountRaw, swapper: owner, slippageTolerance: SLIPPAGE_PCT });
  if (quote.routing !== "CLASSIC") throw new RoundError(`Uniswap returned ${quote.routing} routing, which Venue0 does not execute.`);
  await (await db()).query(
    "insert into residual_quotes (round_id, owner, quote) values ($1, $2, $3::text::jsonb) on conflict (round_id, owner) do update set quote = excluded.quote, created_at = now()",
    [round.id, key(owner), toJson(quote)],
  );
  const out = BigInt(quote.quote.output?.amount ?? "0");
  return { approval: null, permitData: quote.permitData, amountOut: out.toString(), minimumOut: ((out * BigInt(Math.floor((100 - SLIPPAGE_PCT) * 100))) / 10_000n).toString() };
}

export async function swapBuild(round: RoundRecord, owner: Address, permitSignature: Hex | null): Promise<TransactionRequest> {
  const [row] = await (await db()).query<{ quote: unknown; age: string | number }>("select quote, extract(epoch from now() - created_at) as age from residual_quotes where round_id = $1 and owner = $2", [round.id, key(owner)]);
  if (!row || Number(row.age) > QUOTE_TTL_SEC) throw new RoundError("The quote expired. Get a fresh quote.");
  const stash = { quote: fromJson<QuoteResponse>(row.quote) };
  const permit = stash.quote.permitData && permitSignature ? { signature: permitSignature, permitData: stash.quote.permitData } : undefined;
  if (stash.quote.permitData && !permit) throw new RoundError("This quote needs a Permit2 signature.");
  const swap = await (api() as UniswapTradingApi).swap(stash.quote.quote, permit);
  return swap.swap;
}

/** Confirms the swap from chain data: receipt status and the owner's balance change in both tokens around its block. */
export async function swapRecord(round: RoundRecord, owner: Address, txHash: Hex) {
  const rec = await recommend(round, owner);
  if (!rec.pair) throw new RoundError("No residual pair to record.");
  const rpc = client();
  const receipt = await rpc.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 });
  const balance = (token: Address, blockNumber: bigint) => rpc.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], blockNumber });
  const [inBefore, inAfter, outBefore, outAfter] = await Promise.all([
    balance(rec.pair.sell.token, receipt.blockNumber - 1n),
    balance(rec.pair.sell.token, receipt.blockNumber),
    balance(rec.pair.buy.token, receipt.blockNumber - 1n),
    balance(rec.pair.buy.token, receipt.blockNumber),
  ]);
  const detail = { venue: "UNISWAP_TRADING_API", txHash, receiptStatus: receipt.status, block: receipt.blockNumber, spentRaw: inBefore - inAfter, receivedRaw: outAfter - outBefore, engine: rec.plan?.decision ?? null, reasons: rec.plan?.reasons ?? [] };
  await store(round, owner, [rec.pair.sell, rec.pair.buy], rec.plan?.decision ?? "NONE", "EXECUTE_NOW", detail);
  await (await db()).query("delete from residual_quotes where round_id = $1 and owner = $2", [round.id, key(owner)]);
  await logActivity(owner, "RESIDUAL_DECIDED", { choice: "EXECUTE_NOW", txHash, receiptStatus: receipt.status }, { roundId: round.id, circleId: round.circleId });
  return detail;
}
