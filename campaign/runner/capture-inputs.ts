import { writeFile } from "node:fs/promises";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { fetchChainlinkFeeds, fetchRobinhoodAssets, fetchRobinhoodQuote, findStockTokenFeed, readChainlinkSnapshot, restSnapshot, StockTokenRegistry } from "@venue0/assets";
import { FlashApi } from "@venue0/flash";
import { canonicalJson, formatDecimal, robinhoodChain, ROBINHOOD_PUBLIC_RPC } from "@venue0/shared";
import { UniswapTradingApi } from "@venue0/uniswap";

/**
 * Captures the frozen campaign inputs once: a Chainlink price snapshot for the asset universe and route-cost curves
 * measured from live Uniswap and Flash quotes at fixed notional sizes. The campaign never calls providers again.
 */
export const UNIVERSE = ["NVDA", "AAPL", "SPY", "QQQ", "TSLA", "MSFT", "AMZN", "GOOGL", "META"];
export const CURVE_SIZES_USD = [1, 10, 100, 1_000, 10_000];
const USDG: Address = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const QUOTER: Address = "0x71509D21A26F47F83B36A835bB4619Df8F512718";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const rpcUrl = process.env.ROBINHOOD_RPC_URL || ROBINHOOD_PUBLIC_RPC;
const client = createPublicClient({ chain: robinhoodChain(rpcUrl), transport: http(rpcUrl) }) as PublicClient;
const capturedAt = new Date().toISOString();
const nowSec = Math.floor(Date.now() / 1000);
const registry = new StockTokenRegistry((await fetchRobinhoodAssets()).valid, capturedAt);
const feeds = await fetchChainlinkFeeds();

const assets = [];
for (const symbol of UNIVERSE) {
  const token = registry.resolveSymbol(symbol);
  const reading = await readChainlinkSnapshot(client, token, findStockTokenFeed(feeds, symbol), nowSec);
  assets.push({ symbol, uid: token.uid, token: token.contractAddress, priceUsdE18: reading.snapshot.priceUsdE18, feedAgeSec: reading.ageSec, sourceBlock: reading.snapshot.sourceBlock });
}
await writeFile("campaign/data/price-snapshot.json", `${canonicalJson({ capturedAt, source: "CHAINLINK_STOCK_TOKEN_FEED", assets }, 2)}\n`);

const uniswap = new UniswapTradingApi(process.env.UNISWAP_API_KEY as string);
const flash = new FlashApi(process.env.FLASH_API_KEY as string);
const points = [];
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!/UpstreamTimeoutError|ResourceNotFound|429/.test((error as Error).message)) throw error;
    await sleep(1_500);
    return fn();
  }
}

for (const a of assets) {
  // Cost reference: fresh Robinhood REST mid x multiplier (15s cache), not the possibly hours-old Chainlink answer.
  const reference = restSnapshot(registry.resolveSymbol(a.symbol), await fetchRobinhoodQuote(a.symbol), 120);
  const price = Number(reference.priceUsdE18 / 10n ** 12n) / 1e6;
  for (const size of CURVE_SIZES_USD) {
    for (const side of ["SELL", "BUY"] as const) {
      const stockUnits = size / price;
      const stockRaw = BigInt(Math.floor(stockUnits * 1e18));
      const usdgRaw = BigInt(Math.round(size * 1e6));
      const point: Record<string, unknown> = { symbol: a.symbol, sizeUsd: size, side, referencePriceUsd: price, referenceSource: "ROBINHOOD_REST_NORMALIZED", observedAt: new Date().toISOString() };
      try {
        const q = await retry(() => uniswap.quote({ tokenIn: side === "SELL" ? a.token : USDG, tokenOut: side === "SELL" ? USDG : a.token, amount: side === "SELL" ? stockRaw : usdgRaw, swapper: QUOTER, slippageTolerance: 1 }));
        const out = BigInt(q.quote.output?.amount ?? "0");
        const outUsd = side === "SELL" ? Number(out) / 1e6 : (Number(out) / 1e18) * price;
        point.uniswap = { requestId: q.requestId, routing: q.routing, route: q.quote.routeString, outUsd, gasFeeUsd: Number(q.quote.gasFeeUSD ?? 0), allInCostUsd: size - outUsd + Number(q.quote.gasFeeUSD ?? 0) };
      } catch (error) {
        point.uniswap = { error: (error as Error).message.slice(0, 200) };
      }
      await sleep(250);
      try {
        const q = await retry(() => flash.quote({ targetAsset: a.token, contraAsset: USDG, side: side === "SELL" ? "sell" : "buy", qty: side === "SELL" ? formatDecimal(stockRaw) : size.toFixed(6), orderType: "limit", limitCrossPrice: price.toFixed(6) }, QUOTER));
        const outUsd = side === "SELL" ? Number(q.to.amount) : Number(q.to.amount) * price;
        point.flash = { quoteId: q.quoteId, feeUsd: Number(q.fees.estimatedFeeNotional), outUsd, allInCostUsd: size - outUsd };
      } catch (error) {
        point.flash = { error: (error as Error).message.slice(0, 200) };
      }
      await sleep(250);
      points.push(point);
      console.log(a.symbol, size, side, JSON.stringify(point.uniswap).slice(0, 80), JSON.stringify(point.flash).slice(0, 80));
    }
  }
}
await writeFile("campaign/data/cost-curves.json", `${canonicalJson({ capturedAt, quoter: QUOTER, note: "Quotes only. No orders placed. Cost reference = Robinhood REST mid x currentMultiplier fetched per asset before its quotes. Flash LIMIT at that reference; Uniswap EXACT_INPUT with router 2.1.1. Negative cost means the quote beat the reference mid.", points }, 2)}\n`);
