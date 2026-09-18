import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAddress, type Address } from "viem";
import { fetchRobinhoodAssets, fetchRobinhoodQuote, StockTokenRegistry } from "@venue0/assets";
import { FlashApi, placeFlashOrder } from "@venue0/flash";
import { decideResidual, routeCost, usEquitySession, type ResidualPolicy, type RouteCostEstimate } from "@venue0/residual";
import { E18, formatDecimal, log } from "@venue0/shared";
import { UniswapTradingApi } from "@venue0/uniswap";
import { createContext, parseMode, writeArtifact } from "./context.ts";

/**
 * L6: take the EXTERNAL residual of the latest live L6 round, gather live execution context, let the session-aware
 * residual engine choose, and execute the choice on Flash. Evidence records the decision inputs, order id and status.
 */
type Residual = { owner: Address; assetUid: string; token: Address; side: "BUY" | "SELL"; amountRaw: string; notionalUsdE18: string; residualClass: string };

const mode = parseMode(process.argv);
/** --decide-only evaluates routes and records the decision without placing any order. */
const decideOnly = process.argv.includes("--decide-only");
if (mode !== "live") throw new Error("L6 talks to live Flash and Uniswap APIs; run with --live");
const base = join("evidence", "live", "L6-flash-round");
const source = join(base, (await readdir(base)).sort().at(-1) as string);
const planFile = JSON.parse(await readFile(join(source, "settlement-plan.json"), "utf8")) as { plan: { residuals: Residual[] } };
const intents = JSON.parse(await readFile(join(source, "intents.json"), "utf8")) as { intents: Array<{ owner: Address; policy: ResidualPolicy }> };
const snapshot = JSON.parse(await readFile(join(source, "valuation-snapshot.json"), "utf8")) as { snapshot: { prices: Array<{ assetUid: string; priceUsdE18: string }> } };
const sell = planFile.plan.residuals.find((r) => r.residualClass === "EXTERNAL" && r.side === "SELL");
const buy = planFile.plan.residuals.find((r) => r.residualClass === "EXTERNAL" && r.side === "BUY" && r.owner === sell?.owner);
if (!sell || !buy) throw new Error(`no SELL/BUY external residual pair in ${source}`);
const policy = intents.intents.find((i) => getAddress(i.owner) === getAddress(sell.owner))?.policy as ResidualPolicy;

const ctx = await createContext(mode, 3);
try {
  const wallet = ctx.wallets.find((w) => getAddress(w.address) === getAddress(sell.owner));
  if (!wallet) throw new Error(`residual owner ${sell.owner} is not configured`);
  const priceOf = (uid: string) => BigInt(snapshot.snapshot.prices.find((p) => p.assetUid === uid)?.priceUsdE18 as string);
  const amountRaw = BigInt(sell.amountRaw);
  const notionalUsd = Number(BigInt(sell.notionalUsdE18) / 10n ** 12n) / 1e6;

  const registry = new StockTokenRegistry((await fetchRobinhoodAssets()).valid, new Date().toISOString());
  const token = registry.requireCanonicalAddress(sell.token);
  const quote = await fetchRobinhoodQuote(token.symbol);
  const session = usEquitySession(new Date());

  const observedAt = new Date().toISOString();
  const sellPrice = Number(priceOf(sell.assetUid) / 10n ** 12n) / 1e6;
  const buyPrice = Number(priceOf(buy.assetUid) / 10n ** 12n) / 1e6;
  const units = (raw: bigint) => Number(raw / 10n ** 9n) / 1e9;
  const referenceInUsd = units(amountRaw) * sellPrice;
  const routes: RouteCostEstimate[] = [];

  const uni = await new UniswapTradingApi(process.env.UNISWAP_API_KEY as string)
    .quote({ tokenIn: sell.token, tokenOut: buy.token, amount: amountRaw, swapper: wallet.address, slippageTolerance: 1 })
    .catch(() => undefined);
  if (uni?.quote.output?.amount) {
    const gas = Number(uni.quote.gasFeeUSD ?? 0);
    routes.push(routeCost({ venue: "UNISWAP", style: "MARKET", referenceInUsd, referenceOutUsd: units(BigInt(uni.quote.output.amount)) * buyPrice, providerFeeUsd: null, networkCostUsd: gas, fixedCostUsd: gas, source: `uniswap quote ${uni.requestId}`, observedAt }));
  }

  // Flash fees arrive as one notional; Flash docs state a 10 bps base trade fee, the rest is treated as the fixed network fee.
  const flash = new FlashApi(process.env.FLASH_API_KEY as string);
  const qty = formatDecimal(amountRaw);
  const flashQuotes: Record<string, unknown> = {};
  for (const style of ["MARKET", "LIMIT"] as const) {
    const q = await flash
      .quote({ targetAsset: sell.token, contraAsset: buy.token, side: "sell", qty, orderType: style === "MARKET" ? "market" : "limit", ...(style === "LIMIT" ? { limitCrossPrice: formatDecimal((priceOf(sell.assetUid) * 10n ** 18n) / priceOf(buy.assetUid)) } : {}) }, wallet.address)
      .catch(() => undefined);
    if (!q) continue;
    flashQuotes[style] = { quoteId: q.quoteId, to: q.to, from: q.from, fees: q.fees };
    const fee = Number(q.fees.estimatedFeeNotional);
    routes.push(routeCost({ venue: "FLASH", style, referenceInUsd, referenceOutUsd: Number(q.to.amount) * buyPrice, providerFeeUsd: fee, networkCostUsd: null, fixedCostUsd: Math.max(0, fee - referenceInUsd * 0.001), source: `flash quote ${q.quoteId}`, observedAt }));
  }

  const context = {
    notionalUsd,
    session,
    capabilities: token.tradingCapabilities,
    tradingHalt: quote.isTradingHalt,
    referenceDriftBps: 0,
    routes,
    twapThresholdUsd: 1_000,
    nextRoundAvailable: true,
  };
  const plan = decideResidual(policy, context);
  log("residual.decision", { decision: plan.decision, route: plan.route && `${plan.route.venue} ${plan.route.style}`, reasons: plan.reasons, session, routes: plan.evaluated.map((r) => `${r.venue} ${r.style} ${r.allInCostBps}bps ${r.note}`) });

  // Limit price: the snapshot reference cross price (buy-asset per sell-asset) less the user's max slippage.
  const referenceCross = (priceOf(sell.assetUid) * E18) / priceOf(buy.assetUid);
  const limitCross = (referenceCross * BigInt(10_000 - policy.maxExternalSlippageBps)) / 10_000n;
  let execution;
  if (!decideOnly && plan.route?.venue === "FLASH" && (plan.decision === "LIMIT" || plan.decision === "TWAP")) {
    execution = await placeFlashOrder(flash, wallet.client, ctx.publicClient, {
      targetAsset: sell.token,
      contraAsset: buy.token,
      side: "sell",
      qty,
      orderType: plan.decision === "LIMIT" ? "limit" : "twap",
      ...(plan.decision === "LIMIT" ? { limitCrossPrice: formatDecimal(limitCross) } : { durationSeconds: 1_800, twapBucketCount: 3 }),
    }, 90);
  }
  const finalStatus = execution?.statusHistory.at(-1)?.status ?? "NOT_EXECUTED";
  const dir = ctx.evidenceDir(decideOnly ? "L6-residual-decision" : "L6-flash-residual");
  await writeArtifact(dir, "summary.json", {
    gate: "L6",
    environment: ctx.environment,
    timestamp: new Date().toISOString(),
    sourceRound: source,
    residualSell: sell,
    residualBuy: buy,
    policy,
    decideOnly,
    decisionContext: { ...context, capabilities: token.tradingCapabilities.sessions, referenceInUsd, uniswapQuoteRequestId: uni?.requestId ?? null, flashQuotes },
    decision: plan,
    limitCrossPrice: plan.decision === "LIMIT" ? formatDecimal(limitCross) : null,
    execution,
    finalStatus,
    note: "A Flash order id and status are evidence of submission. A fill is claimed only if status is ORDER_STATUS_FILLED and wallet balances confirm it.",
  });
  log("l6.done", { decision: plan.decision, orderId: execution?.orderId ?? null, finalStatus, dir });
} finally {
  ctx.close();
}
