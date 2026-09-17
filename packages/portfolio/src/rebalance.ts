import { rawUnitsForValue, valueUsdE18 } from "@venue0/assets";
import { absDiff, BPS, minBig, mulDivDown, type Address, type AssetUid } from "@venue0/shared";
import type { AssetDeltaLimit, Holding, PortfolioTarget } from "./types.ts";

export type AssetPosition = {
  assetUid: AssetUid;
  token: Address;
  rawBalance: bigint;
  valueUsdE18: bigint;
  targetValueUsdE18: bigint;
  deltaValueUsdE18: bigint;
};

export type RebalancePlan = {
  account: Address;
  totalValueUsdE18: bigint;
  positions: AssetPosition[];
  allocationErrorBps: bigint;
};

function sortPositions(positions: AssetPosition[]): AssetPosition[] {
  return positions.sort((a, b) => (a.assetUid < b.assetUid ? -1 : 1));
}

/**
 * Exact rebalance math. Weight targets are resolved against the current total value under one snapshot.
 * Assets held but absent from the target list are targeted to zero.
 */
export function computeRebalance(
  holdings: readonly Holding[],
  target: PortfolioTarget,
  prices: ReadonlyMap<AssetUid, bigint>,
  tokens: ReadonlyMap<AssetUid, Address>,
): RebalancePlan {
  const balances = new Map<AssetUid, bigint>();
  for (const h of holdings) {
    if (h.owner.toLowerCase() !== target.account.toLowerCase()) throw new Error(`holding owner ${h.owner} != target account`);
    if (balances.has(h.assetUid)) throw new Error(`duplicate holding for ${h.assetUid}`);
    if (h.rawBalance < 0n) throw new Error(`negative balance for ${h.assetUid}`);
    balances.set(h.assetUid, h.rawBalance);
  }

  const price = (uid: AssetUid): bigint => {
    const p = prices.get(uid);
    if (p === undefined) throw new Error(`no snapshot price for ${uid}`);
    return p;
  };

  let totalValue = 0n;
  for (const [uid, raw] of balances) totalValue += valueUsdE18(raw, price(uid));

  const targetValues = new Map<AssetUid, bigint>();
  let weightSum = 0;
  for (const entry of target.targets) {
    if (targetValues.has(entry.assetUid)) throw new Error(`duplicate target for ${entry.assetUid}`);
    const hasWeight = entry.targetWeightBps !== undefined;
    const hasValue = entry.targetValueUsdE18 !== undefined;
    if (hasWeight === hasValue) throw new Error(`target for ${entry.assetUid} needs exactly one of weight or value`);
    let value: bigint;
    if (hasWeight) {
      const bps = entry.targetWeightBps as number;
      if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error(`invalid weight ${bps} for ${entry.assetUid}`);
      weightSum += bps;
      value = mulDivDown(totalValue, BigInt(bps), BPS);
    } else {
      value = entry.targetValueUsdE18 as bigint;
      if (value < 0n) throw new Error(`negative target value for ${entry.assetUid}`);
    }
    targetValues.set(entry.assetUid, value);
  }
  if (weightSum > 10_000) throw new Error(`target weights sum to ${weightSum} bps`);

  const uids = new Set<AssetUid>([...balances.keys(), ...targetValues.keys()]);
  const positions: AssetPosition[] = [];
  for (const uid of uids) {
    const token = tokens.get(uid);
    if (!token) throw new Error(`no canonical token for ${uid}`);
    const raw = balances.get(uid) ?? 0n;
    const value = valueUsdE18(raw, price(uid));
    const targetValue = targetValues.get(uid) ?? 0n;
    positions.push({ assetUid: uid, token, rawBalance: raw, valueUsdE18: value, targetValueUsdE18: targetValue, deltaValueUsdE18: targetValue - value });
  }

  const sorted = sortPositions(positions);
  return { account: target.account, totalValueUsdE18: totalValue, positions: sorted, allocationErrorBps: allocationErrorBps(sorted, totalValue) };
}

/** Half the L1 distance between current and target values, in bps of total value. 0 = on target, 10000 = fully misallocated. */
export function allocationErrorBps(positions: readonly Pick<AssetPosition, "valueUsdE18" | "targetValueUsdE18">[], totalValue: bigint): bigint {
  if (totalValue === 0n) return 0n;
  let distance = 0n;
  for (const p of positions) distance += absDiff(p.valueUsdE18, p.targetValueUsdE18);
  return mulDivDown(distance, BPS, 2n * totalValue);
}

/** Converts value deltas into raw-unit limits. Sells never exceed the held balance; rounding is always down. */
export function deltaLimits(plan: RebalancePlan, prices: ReadonlyMap<AssetUid, bigint>, minValueUsdE18 = 0n): AssetDeltaLimit[] {
  const limits: AssetDeltaLimit[] = [];
  for (const p of plan.positions) {
    const price = prices.get(p.assetUid);
    if (price === undefined) throw new Error(`no snapshot price for ${p.assetUid}`);
    const magnitude = p.deltaValueUsdE18 < 0n ? -p.deltaValueUsdE18 : p.deltaValueUsdE18;
    if (magnitude === 0n || magnitude < minValueUsdE18) continue;
    const raw = rawUnitsForValue(magnitude, price);
    if (p.deltaValueUsdE18 < 0n) {
      const maxOut = minBig(raw, p.rawBalance);
      if (maxOut > 0n) limits.push({ assetUid: p.assetUid, token: p.token, maxOutRaw: maxOut, maxInRaw: 0n });
    } else if (raw > 0n) {
      limits.push({ assetUid: p.assetUid, token: p.token, maxOutRaw: 0n, maxInRaw: raw });
    }
  }
  return limits;
}

/** Applies signed raw deltas to holdings and re-values under the same snapshot. */
export function applyRawDeltas(
  plan: RebalancePlan,
  rawDeltas: ReadonlyMap<AssetUid, bigint>,
  prices: ReadonlyMap<AssetUid, bigint>,
): RebalancePlan {
  const positions = plan.positions.map((p) => {
    const raw = p.rawBalance + (rawDeltas.get(p.assetUid) ?? 0n);
    if (raw < 0n) throw new Error(`delta drives ${p.assetUid} negative`);
    const price = prices.get(p.assetUid);
    if (price === undefined) throw new Error(`no snapshot price for ${p.assetUid}`);
    const value = valueUsdE18(raw, price);
    return { ...p, rawBalance: raw, valueUsdE18: value, deltaValueUsdE18: p.targetValueUsdE18 - value };
  });
  for (const uid of rawDeltas.keys()) {
    if (!plan.positions.some((p) => p.assetUid === uid)) throw new Error(`delta for asset ${uid} outside the rebalance plan`);
  }
  const total = positions.reduce((sum, p) => sum + p.valueUsdE18, 0n);
  return { account: plan.account, totalValueUsdE18: total, positions, allocationErrorBps: allocationErrorBps(positions, plan.totalValueUsdE18) };
}
