import "server-only";
import { createPublicClient, erc20Abi, getAddress, http, isAddress, type Address, type PublicClient } from "viem";
import {
  fetchChainlinkFeeds,
  fetchRobinhoodAssets,
  readChainlinkSnapshot,
  StockTokenRegistry,
  type CanonicalStockToken,
  type ChainlinkFeedEntry,
} from "@venue0/assets";
import { robinhoodChain } from "@venue0/shared";
import { env } from "./env";

const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";
const TTL_MS = 60_000;

let cache: { at: number; registry: StockTokenRegistry; feeds: ChainlinkFeedEntry[] } | undefined;

export function client(): PublicClient {
  return createPublicClient({ chain: robinhoodChain(env.rpcUrl), transport: http(env.rpcUrl) }) as PublicClient;
}

/** Live Robinhood registry and Chainlink feed directory, cached for a minute. */
export async function universe() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const [assets, feeds] = await Promise.all([fetchRobinhoodAssets(), fetchChainlinkFeeds()]);
  cache = { at: Date.now(), registry: new StockTokenRegistry(assets.valid, assets.fetchedAt), feeds };
  return cache;
}

/** Stock Tokens Venue0 can value: canonical, and with exactly one Chainlink feed named for them. */
export function priceable(registry: StockTokenRegistry, feeds: ChainlinkFeedEntry[]) {
  return registry.all().flatMap((token) => {
    const matches = feeds.filter((f) => f.name === `Robinhood ${token.symbol} / USD`);
    return matches.length === 1 ? [{ token, feed: matches[0] as ChainlinkFeedEntry }] : [];
  });
}

export type Position = { uid: string; symbol: string; name: string; token: Address; rawBalance: string; priceUsd: number; priceE18: string; valueUsd: number; feedAgeSec: number; stale: boolean };

export type PortfolioResult =
  | { ok: true; address: Address; positions: Position[]; totalUsd: number; registryResolvedAt: string; priceableCount: number; readAt: string; chainId: number }
  | { ok: false; reason: "INVALID_ADDRESS" | "RPC_UNAVAILABLE" | "WRONG_CHAIN" | "REGISTRY_UNAVAILABLE"; detail: string };

export async function loadPortfolio(input: string): Promise<PortfolioResult> {
  if (!isAddress(input, { strict: false })) return { ok: false, reason: "INVALID_ADDRESS", detail: `${input} is not an EVM address` };
  const address = getAddress(input);
  const rpc = client();
  let chainId: number;
  try {
    chainId = await rpc.getChainId();
  } catch (error) {
    return { ok: false, reason: "RPC_UNAVAILABLE", detail: (error as Error).message.split("\n")[0] ?? "rpc error" };
  }
  if (chainId !== 4663) return { ok: false, reason: "WRONG_CHAIN", detail: `RPC reports chain ${chainId}, expected Robinhood Chain 4663` };

  let u: Awaited<ReturnType<typeof universe>>;
  try {
    u = await universe();
  } catch (error) {
    return { ok: false, reason: "REGISTRY_UNAVAILABLE", detail: (error as Error).message };
  }
  const list = priceable(u.registry, u.feeds);
  const balances = await rpc.multicall({
    multicallAddress: MULTICALL3,
    contracts: list.map(({ token }) => ({ address: token.contractAddress, abi: erc20Abi, functionName: "balanceOf" as const, args: [address] as const })),
  });
  const held = list.filter((_, i) => balances[i]?.status === "success" && (balances[i]?.result as bigint) > 10n ** 12n);
  const positions: Position[] = [];
  for (const { token, feed } of held) {
    const raw = balances[list.findIndex((x) => x.token.uid === token.uid)]?.result as bigint;
    const reading = await readChainlinkSnapshot(rpc, token as CanonicalStockToken, feed);
    const priceUsd = Number(reading.snapshot.priceUsdE18 / 10n ** 12n) / 1e6;
    const units = Number(raw / 10n ** 9n) / 1e9;
    positions.push({ uid: token.uid, symbol: token.symbol, name: token.name, token: token.contractAddress, rawBalance: raw.toString(), priceUsd, priceE18: reading.snapshot.priceUsdE18.toString(), valueUsd: units * priceUsd, feedAgeSec: reading.ageSec, stale: reading.snapshot.stale });
  }
  positions.sort((a, b) => b.valueUsd - a.valueUsd);
  return { ok: true, address, positions, totalUsd: positions.reduce((s, p) => s + p.valueUsd, 0), registryResolvedAt: u.registry.resolvedAt, priceableCount: list.length, readAt: new Date().toISOString(), chainId };
}
