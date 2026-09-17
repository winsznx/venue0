import type { Address, PublicClient } from "viem";
import { getAddress } from "viem";
import { z } from "zod";
import { divergenceBps, parseDecimal, pinnedReadBlock, ROBINHOOD_CHAIN_ID } from "@venue0/shared";
import { chainlinkAggregatorAbi } from "./abi.ts";
import type { CanonicalStockToken } from "./canonical.ts";
import { tokenPriceFromUnderlying, chainlinkAnswerToPriceE18, type PriceSnapshot } from "./valuation.ts";
import type { ApiQuote } from "./robinhood-api.ts";

/** Machine-readable feed list that backs docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood. */
export const CHAINLINK_ROBINHOOD_FEEDS_URL = "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json";

const feedSchema = z.looseObject({
  name: z.string(),
  proxyAddress: z.string().nullable().optional(),
  decimals: z.number().int(),
  heartbeat: z.number().int(),
  assetName: z.string().optional(),
});

export type ChainlinkFeedEntry = {
  name: string;
  proxyAddress: Address;
  decimals: number;
  heartbeatSec: number;
  assetName?: string;
};

export async function fetchChainlinkFeeds(fetchImpl: typeof fetch = fetch): Promise<ChainlinkFeedEntry[]> {
  const response = await fetchImpl(CHAINLINK_ROBINHOOD_FEEDS_URL);
  if (!response.ok) throw new Error(`Chainlink feed directory returned HTTP ${response.status}`);
  const entries = z.array(z.unknown()).parse(await response.json());
  const feeds: ChainlinkFeedEntry[] = [];
  for (const entry of entries) {
    const parsed = feedSchema.safeParse(entry);
    if (!parsed.success || !parsed.data.proxyAddress) continue;
    const feed: ChainlinkFeedEntry = {
      name: parsed.data.name,
      proxyAddress: getAddress(parsed.data.proxyAddress),
      decimals: parsed.data.decimals,
      heartbeatSec: parsed.data.heartbeat,
    };
    if (parsed.data.assetName) feed.assetName = parsed.data.assetName;
    feeds.push(feed);
  }
  return feeds;
}

/**
 * The directory names Stock Token feeds by ticker ("Robinhood NVDA / USD"), not by token address.
 * A ticker match is only a candidate; callers must cross-check the price against the normalized REST quote.
 */
export function findStockTokenFeed(feeds: readonly ChainlinkFeedEntry[], symbol: string): ChainlinkFeedEntry {
  const matches = feeds.filter((f) => f.name === `Robinhood ${symbol} / USD`);
  if (matches.length !== 1) throw new Error(`expected one Chainlink feed named "Robinhood ${symbol} / USD", found ${matches.length}`);
  return matches[0] as ChainlinkFeedEntry;
}

export type FeedReading = {
  snapshot: PriceSnapshot;
  feed: ChainlinkFeedEntry;
  description: string;
  roundId: bigint;
  ageSec: number;
};

export async function readChainlinkSnapshot(
  client: PublicClient,
  token: CanonicalStockToken,
  feed: ChainlinkFeedEntry,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<FeedReading> {
  const blockNumber = await pinnedReadBlock(client);
  const base = { address: feed.proxyAddress, abi: chainlinkAggregatorAbi, blockNumber } as const;
  const [decimals, description, round] = await Promise.all([
    client.readContract({ ...base, functionName: "decimals" }),
    client.readContract({ ...base, functionName: "description" }),
    client.readContract({ ...base, functionName: "latestRoundData" }),
  ]);
  if (decimals !== feed.decimals) throw new Error(`feed ${feed.name} decimals ${decimals} != directory ${feed.decimals}`);
  const [roundId, answer, , updatedAt, answeredInRound] = round;
  if (answeredInRound < roundId) throw new Error(`feed ${feed.name} answeredInRound < roundId`);

  const ageSec = nowSec - Number(updatedAt);
  return {
    feed,
    description,
    roundId,
    ageSec,
    snapshot: {
      assetUid: token.uid,
      tokenAddress: token.contractAddress,
      chainId: ROBINHOOD_CHAIN_ID,
      priceUsdE18: chainlinkAnswerToPriceE18(answer, decimals),
      source: "CHAINLINK_STOCK_TOKEN_FEED",
      sourceTimestamp: Number(updatedAt),
      sourceBlock: blockNumber,
      multiplierE18: token.currentMultiplierE18,
      stale: ageSec > feed.heartbeatSec,
    },
  };
}

export function restSnapshot(token: CanonicalStockToken, quote: ApiQuote, maxAgeSec: number, nowSec = Math.floor(Date.now() / 1000)): PriceSnapshot {
  if (quote.currency !== "USD") throw new Error(`unexpected quote currency ${quote.currency}`);
  const bid = parseDecimal(quote.bid);
  const ask = parseDecimal(quote.ask);
  if (bid <= 0n || ask < bid) throw new Error(`invalid bid/ask for ${token.symbol}: ${quote.bid}/${quote.ask}`);
  const midRaw = (bid + ask) / 2n;
  const sourceTimestamp = Math.floor(Date.parse(quote.generatedAt) / 1000);
  return {
    assetUid: token.uid,
    tokenAddress: token.contractAddress,
    chainId: ROBINHOOD_CHAIN_ID,
    priceUsdE18: tokenPriceFromUnderlying(midRaw, token.currentMultiplierE18),
    source: "ROBINHOOD_REST_NORMALIZED",
    sourceTimestamp,
    multiplierE18: token.currentMultiplierE18,
    rawUnderlyingPrice: midRaw.toString(),
    bid: quote.bid,
    ask: quote.ask,
    stale: quote.isTradingHalt || nowSec - sourceTimestamp > maxAgeSec,
  };
}

export function snapshotDivergenceBps(a: PriceSnapshot, b: PriceSnapshot): bigint {
  if (a.assetUid !== b.assetUid) throw new Error("cannot compare snapshots of different assets");
  return divergenceBps(a.priceUsdE18, b.priceUsdE18, b.priceUsdE18);
}
