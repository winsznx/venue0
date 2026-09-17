import type { PriceSnapshot, PriceSource } from "@venue0/assets";
import { hashCanonical, ROBINHOOD_CHAIN_ID, type AssetUid, type Hex } from "@venue0/shared";

export type ValuationSnapshot = {
  chainId: typeof ROBINHOOD_CHAIN_ID;
  capturedAt: number;
  source: PriceSource;
  maxAgeSec: number;
  prices: PriceSnapshot[];
};

export function buildValuationSnapshot(
  prices: readonly PriceSnapshot[],
  capturedAt: number,
  maxAgeSec: number,
): ValuationSnapshot {
  if (prices.length === 0) throw new Error("valuation snapshot needs at least one price");
  const sources = new Set(prices.map((p) => p.source));
  if (sources.size !== 1) throw new Error(`valuation snapshot mixes price sources: ${[...sources].join(", ")}`);
  const seen = new Set<string>();
  for (const price of prices) {
    if (seen.has(price.assetUid)) throw new Error(`duplicate price for ${price.assetUid}`);
    seen.add(price.assetUid);
    if (price.priceUsdE18 <= 0n) throw new Error(`non-positive price for ${price.assetUid}`);
  }
  const [source] = sources;
  const sorted = [...prices].sort((a, b) => (a.assetUid < b.assetUid ? -1 : 1));
  return { chainId: ROBINHOOD_CHAIN_ID, capturedAt, source: source as PriceSource, maxAgeSec, prices: sorted };
}

export function hashValuationSnapshot(snapshot: ValuationSnapshot): Hex {
  return hashCanonical(snapshot);
}

export type SnapshotProblem = { assetUid?: AssetUid; reason: string };

/** Returns every reason the snapshot may not be used at `nowSec`. Empty means usable. */
export function snapshotProblems(snapshot: ValuationSnapshot, nowSec: number): SnapshotProblem[] {
  const problems: SnapshotProblem[] = [];
  const age = nowSec - snapshot.capturedAt;
  if (age < 0) problems.push({ reason: `snapshot captured in the future (${-age}s)` });
  if (age > snapshot.maxAgeSec) problems.push({ reason: `snapshot age ${age}s exceeds ${snapshot.maxAgeSec}s` });
  for (const price of snapshot.prices) {
    if (price.stale) problems.push({ assetUid: price.assetUid, reason: "price flagged stale at capture" });
  }
  return problems;
}

export function priceMap(snapshot: ValuationSnapshot): Map<AssetUid, bigint> {
  return new Map(snapshot.prices.map((p) => [p.assetUid, p.priceUsdE18]));
}
