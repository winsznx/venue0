import type { Address, PublicClient } from "viem";
import {
  fetchChainlinkFeeds,
  fetchRobinhoodAssets,
  fetchRobinhoodQuote,
  findStockTokenFeed,
  readChainlinkSnapshot,
  restSnapshot,
  snapshotDivergenceBps,
  StockTokenRegistry,
  verifyStockTokenOnchain,
  type CanonicalStockToken,
  type OnchainVerification,
  type PriceSnapshot,
} from "@venue0/assets";
import { log } from "@venue0/shared";

const BEACON_IMPLEMENTATION_ABI = [{ type: "function", name: "implementation", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;

export type ResolvedAsset = {
  token: CanonicalStockToken;
  onchain: OnchainVerification;
  implementation: Address;
};

export type Resolution = {
  resolvedAt: string;
  registrySize: number;
  assets: ResolvedAsset[];
};

/** Resolves each symbol from the live Robinhood registry and enforces the PRD asset-selection invariant onchain. */
export async function resolveStockTokens(client: PublicClient, symbols: readonly string[]): Promise<Resolution> {
  const fetched = await fetchRobinhoodAssets();
  const registry = new StockTokenRegistry(fetched.valid, fetched.fetchedAt);
  const assets: ResolvedAsset[] = [];
  for (const symbol of symbols) {
    const token = registry.resolveSymbol(symbol);
    const onchain = await verifyStockTokenOnchain(client, token);
    if (!onchain.ok) throw new Error(`${symbol} failed onchain verification: ${onchain.failures.join("; ")}`);
    const implementation = await client.readContract({ address: onchain.observed.registry, abi: BEACON_IMPLEMENTATION_ABI, functionName: "implementation" });
    assets.push({ token, onchain, implementation });
    log("resolve.asset", { symbol, uid: token.uid, address: token.contractAddress, implementation });
  }
  return { resolvedAt: fetched.fetchedAt, registrySize: registry.size, assets };
}

export type PriceEvidence = { chainlink: PriceSnapshot; rest: PriceSnapshot; divergenceBps: bigint; feedAgeSec: number; feedDescription: string };

export const MAX_FEED_REST_DIVERGENCE_BPS = 100n;

/**
 * D-003: Chainlink is the valuation source; each feed must be found by exact directory name and agree with the
 * normalized Robinhood REST price within MAX_FEED_REST_DIVERGENCE_BPS.
 */
export async function captureChainlinkPrices(client: PublicClient, assets: readonly ResolvedAsset[], nowSec: number): Promise<PriceEvidence[]> {
  const feeds = await fetchChainlinkFeeds();
  const evidence: PriceEvidence[] = [];
  for (const { token } of assets) {
    const reading = await readChainlinkSnapshot(client, token, findStockTokenFeed(feeds, token.symbol), nowSec);
    const rest = restSnapshot(token, await fetchRobinhoodQuote(token.symbol), 300);
    const divergenceBps = snapshotDivergenceBps(reading.snapshot, rest);
    if (reading.snapshot.stale) throw new Error(`${token.symbol} Chainlink feed is older than its heartbeat`);
    if (divergenceBps > MAX_FEED_REST_DIVERGENCE_BPS) throw new Error(`${token.symbol} feed diverges ${divergenceBps} bps from normalized REST`);
    evidence.push({ chainlink: reading.snapshot, rest, divergenceBps, feedAgeSec: reading.ageSec, feedDescription: reading.description });
  }
  return evidence;
}
