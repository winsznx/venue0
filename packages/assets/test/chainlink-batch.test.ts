import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { readChainlinkSnapshot, readChainlinkSnapshots, type ChainlinkFeedEntry } from "../src/chainlink.ts";
import type { CanonicalStockToken } from "../src/canonical.ts";

const token = (symbol: string, uid: string) => ({ uid, symbol, contractAddress: `0x${uid.slice(-40)}`, currentMultiplierE18: 10n ** 18n }) as unknown as CanonicalStockToken;
const feed = (name: string, proxy: string): ChainlinkFeedEntry => ({ name, proxyAddress: proxy as `0x${string}`, decimals: 8, heartbeatSec: 86_400 }) as unknown as ChainlinkFeedEntry;

const rounds: Record<string, readonly [bigint, bigint, bigint, bigint, bigint]> = {
  "0x0000000000000000000000000000000000000aaa": [5n, 18_512_000_000n, 0n, 1_000n, 5n],
  "0x0000000000000000000000000000000000000bbb": [9n, 23_100_000_000n, 0n, 1_100n, 9n],
};

/** Fake RPC that answers both the per-feed reads and the multicall from the same table. */
const client = {
  getBlockNumber: async () => 1_000n,
  readContract: async ({ address, functionName }: { address: string; functionName: string }) => (functionName === "decimals" ? 8 : functionName === "description" ? `feed ${address}` : rounds[address.toLowerCase()]),
  multicall: async ({ contracts }: { contracts: Array<{ address: string; functionName: string }> }) =>
    contracts.map((c) => ({ status: "success", result: c.functionName === "decimals" ? 8 : c.functionName === "description" ? `feed ${c.address}` : rounds[c.address.toLowerCase()] })),
} as unknown as PublicClient;

const items = [
  { token: token("NVDA", "0x00000000000000000000000000000000000000000000000000000000000000a1"), feed: feed("Robinhood NVDA / USD", "0x0000000000000000000000000000000000000aaa") },
  { token: token("AAPL", "0x00000000000000000000000000000000000000000000000000000000000000b2"), feed: feed("Robinhood AAPL / USD", "0x0000000000000000000000000000000000000bbb") },
];

describe("readChainlinkSnapshots", () => {
  it("matches the single-feed reader for every feed", async () => {
    const batch = await readChainlinkSnapshots(client, items, 2_000);
    for (const [i, it] of items.entries()) {
      const single = await readChainlinkSnapshot(client, it.token, it.feed, 2_000);
      expect(batch[i]?.snapshot).toEqual(single.snapshot);
      expect(batch[i]?.ageSec).toBe(single.ageSec);
    }
  });

  it("fails the whole call when one feed cannot be read", async () => {
    const failing = { ...client, multicall: async () => [{ status: "success", result: 8 }, { status: "failure", error: new Error("x") }, { status: "success", result: rounds["0x0000000000000000000000000000000000000aaa"] }] } as unknown as PublicClient;
    await expect(readChainlinkSnapshots(failing, items.slice(0, 1), 2_000)).rejects.toThrow(/could not be read/);
  });

  it("applies the same decimals check as the single reader", async () => {
    const [first] = items;
    if (!first) throw new Error("fixture missing");
    const bad = [{ ...first, feed: { ...first.feed, decimals: 18 } }];
    await expect(readChainlinkSnapshots(client, bad, 2_000)).rejects.toThrow(/decimals/);
  });
});
