import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAddress, type Address } from "viem";
import { fetchRobinhoodAssets, fetchRobinhoodQuote, StockTokenRegistry } from "@venue0/assets";
import { FlashApi, placeFlashOrder } from "@venue0/flash";
import { decideResidual, usEquitySession, type ResidualPolicy } from "@venue0/residual";
import { E18, formatDecimal, log } from "@venue0/shared";
import { UniswapTradingApi } from "@venue0/uniswap";
import { createContext, parseMode, writeArtifact } from "./context.ts";

/**
 * L6: take the EXTERNAL residual of the latest live L6 round, gather live execution context, let the session-aware
 * residual engine choose, and execute the choice on Flash. Evidence records the decision inputs, order id and status.
 */
type Residual = { owner: Address; assetUid: string; token: Address; side: "BUY" | "SELL"; amountRaw: string; notionalUsdE18: string; residualClass: string };

const mode = parseMode(process.argv);
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
  const referenceOutRaw = (amountRaw * priceOf(sell.assetUid)) / priceOf(buy.assetUid);
  const notionalUsd = Number(BigInt(sell.notionalUsdE18) / 10n ** 12n) / 1e6;

  const registry = new StockTokenRegistry((await fetchRobinhoodAssets()).valid, new Date().toISOString());
  const token = registry.requireCanonicalAddress(sell.token);
  const quote = await fetchRobinhoodQuote(token.symbol);
  const session = usEquitySession(new Date());

  const bps = (expected: bigint, actual: bigint) => Number(((expected - actual) * 10_000n) / expected);
  const uni = await new UniswapTradingApi(process.env.UNISWAP_API_KEY as string)
    .quote({ tokenIn: sell.token, tokenOut: buy.token, amount: amountRaw, swapper: wallet.address, slippageTolerance: 1 })
    .catch(() => undefined);
  const uniOut = uni?.quote.output?.amount ? BigInt(uni.quote.output.amount) : undefined;
  const flash = new FlashApi(process.env.FLASH_API_KEY as string);
  const qty = formatDecimal(amountRaw);
  const flashQuote = await flash.quote({ targetAsset: sell.token, contraAsset: buy.token, side: "sell", qty, orderType: "market" }, wallet.address).catch(() => undefined);
  const flashOut = flashQuote ? BigInt(Math.floor(Number(flashQuote.to.amount) * 1e18)) : undefined;

  const context = {
    notionalUsd,
    session,
    capabilities: token.tradingCapabilities,
    tradingHalt: quote.isTradingHalt,
    referenceDriftBps: uniOut === undefined ? 0 : Math.abs(bps(referenceOutRaw, uniOut)),
    ...(uniOut === undefined ? {} : { immediateCostBps: Math.max(0, bps(referenceOutRaw, uniOut)) }),
    advancedVenueAvailable: flashQuote !== undefined,
    ...(flashOut === undefined ? {} : { advancedCostBps: Math.max(0, bps(referenceOutRaw, flashOut)) }),
    twapThresholdUsd: 1_000,
  };
  const plan = decideResidual(policy, context);
  log("l6.decision", { decision: plan.decision, venue: plan.venue, reasons: plan.reasons, session });

  // Limit price: the snapshot reference cross price (buy-asset per sell-asset) less the user's max slippage.
  const referenceCross = (priceOf(sell.assetUid) * E18) / priceOf(buy.assetUid);
  const limitCross = (referenceCross * BigInt(10_000 - policy.maxExternalSlippageBps)) / 10_000n;
  let execution;
  if (plan.venue === "FLASH" && (plan.decision === "LIMIT" || plan.decision === "TWAP")) {
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
  const dir = ctx.evidenceDir("L6-flash-residual");
  await writeArtifact(dir, "summary.json", {
    gate: "L6",
    environment: ctx.environment,
    timestamp: new Date().toISOString(),
    sourceRound: source,
    residualSell: sell,
    residualBuy: buy,
    policy,
    decisionContext: { ...context, capabilities: token.tradingCapabilities.sessions, referenceOutRaw, uniswapOut: uniOut, flashMarketOut: flashQuote?.to.amount, flashFeeNotional: flashQuote?.fees.estimatedFeeNotional },
    decision: plan,
    limitCrossPrice: plan.decision === "LIMIT" ? formatDecimal(limitCross) : null,
    execution,
    finalStatus,
    note: "A Flash order id and status are evidence of submission. A fill is claimed only if status is ORDER_STATUS_FILLED and wallet balances confirm it.",
  });
  log("l6.done", { decision: plan.decision, orderId: execution?.orderId, finalStatus, dir });
} finally {
  ctx.close();
}
