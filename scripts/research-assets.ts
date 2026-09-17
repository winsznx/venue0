import { mkdir, writeFile } from "node:fs/promises";
import { createPublicClient, http, type PublicClient } from "viem";
import {
  canonicalJson,
  explorerAddress,
  hashCanonical,
  log,
  robinhoodChain,
  ROBINHOOD_CHAIN_ID,
} from "@venue0/shared";
import {
  canTrade,
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
} from "@venue0/assets";

const OUT_DIR = "evidence/research";
/** Liquid, widely held names considered for the live demo. Selection is decided by live checks below, not by this list. */
const CANDIDATE_SYMBOLS = ["NVDA", "AAPL", "SPY", "QQQ", "TSLA", "MSFT", "AMZN", "GOOGL", "META"];
const REST_MAX_AGE_SEC = 120;
const MAX_FEED_REST_DIVERGENCE_BPS = 100n;

async function evaluateCandidate(client: PublicClient, token: CanonicalStockToken, feeds: Awaited<ReturnType<typeof fetchChainlinkFeeds>>) {
  const reasons: string[] = [];
  const onchain = await verifyStockTokenOnchain(client, token);
  reasons.push(...onchain.failures);

  const allSessionsTradable = (["market", "extended", "overnight"] as const).every(
    (s) => canTrade(token.tradingCapabilities, s, "whole") && canTrade(token.tradingCapabilities, s, "fractional"),
  );
  if (!allSessionsTradable) reasons.push("not whole+fractional tradable in every session");
  if (token.pendingMultiplier) reasons.push(`pending multiplier ${token.pendingMultiplier}`);

  const quote = await fetchRobinhoodQuote(token.symbol);
  const rest = restSnapshot(token, quote, REST_MAX_AGE_SEC);
  if (rest.stale) reasons.push("REST quote stale or trading halt");

  let chainlink: Awaited<ReturnType<typeof readChainlinkSnapshot>> | undefined;
  let divergence: bigint | undefined;
  try {
    chainlink = await readChainlinkSnapshot(client, token, findStockTokenFeed(feeds, token.symbol));
    divergence = snapshotDivergenceBps(chainlink.snapshot, rest);
    if (chainlink.snapshot.stale) reasons.push("Chainlink feed older than its heartbeat");
    if (divergence > MAX_FEED_REST_DIVERGENCE_BPS) reasons.push(`feed vs normalized REST divergence ${divergence} bps`);
  } catch (error) {
    reasons.push(`chainlink: ${(error as Error).message}`);
  }

  return {
    symbol: token.symbol,
    uid: token.uid,
    contractAddress: token.contractAddress,
    explorer: explorerAddress(token.contractAddress),
    currentMultiplier: token.currentMultiplier,
    tradingCapabilities: token.tradingCapabilities.sessions,
    onchain,
    rest: { quote, snapshot: rest },
    chainlink: chainlink && {
      feed: chainlink.feed,
      description: chainlink.description,
      roundId: chainlink.roundId,
      ageSec: chainlink.ageSec,
      snapshot: chainlink.snapshot,
    },
    feedVsRestDivergenceBps: divergence,
    eligibleForDemo: reasons.length === 0,
    reasons,
  };
}

async function main() {
  const client = createPublicClient({ chain: robinhoodChain(), transport: http() }) as PublicClient;
  const [chainId, blockNumber] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
  if (chainId !== ROBINHOOD_CHAIN_ID) throw new Error(`RPC returned chain ${chainId}, expected ${ROBINHOOD_CHAIN_ID}`);
  log("research.rpc", { chainId, blockNumber });

  const fetched = await fetchRobinhoodAssets();
  const registry = new StockTokenRegistry(fetched.valid, fetched.fetchedAt);
  log("research.assets", { valid: fetched.valid.length, rejectedSchema: fetched.rejected.length, canonical: registry.size });

  const feeds = await fetchChainlinkFeeds();
  const candidates = [];
  for (const symbol of CANDIDATE_SYMBOLS) {
    const token = registry.resolveSymbol(symbol);
    candidates.push(await evaluateCandidate(client, token, feeds));
    log("research.candidate", { symbol, eligible: candidates.at(-1)?.eligibleForDemo });
  }

  const countBy = (values: string[]) => values.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
  const tokens = registry.all();
  const summary = {
    capturedAt: fetched.fetchedAt,
    sources: {
      assets: fetched.url,
      prices: "https://api.robinhood.com/rhj/prices/{symbol}",
      chainlinkDirectory: "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json",
      rpc: "public Robinhood Chain RPC",
    },
    chain: { chainId, blockNumber },
    rawResponseHash: hashCanonical(fetched.raw),
    assetCount: fetched.valid.length + fetched.rejected.length,
    schemaRejected: fetched.rejected,
    canonicalCount: registry.size,
    canonicalRejected: registry.rejected,
    statusCounts: countBy(fetched.valid.map((a) => a.status)),
    capabilityShapeCounts: countBy(tokens.map((t) => t.tradingCapabilities.shape)),
    fractionalUntradableMarket: tokens.filter((t) => !canTrade(t.tradingCapabilities, "market", "fractional")).map((t) => t.symbol),
    nonUnitMultipliers: tokens.filter((t) => t.currentMultiplierE18 !== 10n ** 18n).map((t) => ({ symbol: t.symbol, multiplier: t.currentMultiplier })),
    pendingMultipliers: tokens.filter((t) => t.pendingMultiplier).map((t) => ({ symbol: t.symbol, pending: t.pendingMultiplier })),
    chainlinkStockTokenFeeds: feeds.filter((f) => f.name.startsWith("Robinhood ")).length,
    candidates,
    selectedDemoAssets: candidates.filter((c) => c.eligibleForDemo).map((c) => c.symbol),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(`${OUT_DIR}/robinhood-assets-current.json`, `${canonicalJson(summary, 2)}\n`);
  await writeFile(`${OUT_DIR}/robinhood-assets-raw.json`, `${canonicalJson({ capturedAt: fetched.fetchedAt, url: fetched.url, response: fetched.raw }, 2)}\n`);
  log("research.done", { selected: summary.selectedDemoAssets, out: `${OUT_DIR}/robinhood-assets-current.json` });
}

main().catch((error: unknown) => {
  log("research.failed", { error: (error as Error).message });
  process.exitCode = 1;
});
