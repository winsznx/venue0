import type { PublicClient } from "viem";

/**
 * The public Robinhood Chain RPC is load-balanced: a head block returned by one backend may be unknown to the
 * next ("unsupported block number"). Pinned reads use a block slightly behind head so every backend has it.
 */
export const DEFAULT_READ_LAG_BLOCKS = 40n;

export async function pinnedReadBlock(client: PublicClient, lag = DEFAULT_READ_LAG_BLOCKS): Promise<bigint> {
  const head = await client.getBlockNumber({ cacheTime: 0 });
  return head > lag ? head - lag : head;
}
