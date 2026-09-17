import { getAddress } from "viem";
import type { PriceSnapshot } from "@venue0/assets";
import { E18, type Address, type AssetUid, type Hex } from "@venue0/shared";
import {
  buildValuationSnapshot,
  hashPolicy,
  hashValuationSnapshot,
  type AssetDeltaLimit,
  type ExecutionPolicy,
  type PortfolioIntent,
  type ValuationSnapshot,
} from "@venue0/portfolio";

export const NOW = 1_789_700_000;
export const ROUND_ID = `0x${"ab".repeat(32)}` as Hex;
export const CIRCLE_ID = `0x${"cd".repeat(32)}` as Hex;

export type TestAsset = { symbol: string; uid: AssetUid; token: Address; priceUsdE18: bigint };

function uid(n: number): AssetUid {
  return `0x${n.toString(16).padStart(64, "0")}` as AssetUid;
}

function address(n: number): Address {
  return getAddress(`0x${n.toString(16).padStart(40, "0")}`);
}

/** Synthetic test universe. Prices are round test values, not market data. */
export const ASSETS: Record<string, TestAsset> = {
  NVDA: { symbol: "NVDA", uid: uid(1), token: address(0x1001), priceUsdE18: 200n * E18 },
  AAPL: { symbol: "AAPL", uid: uid(2), token: address(0x1002), priceUsdE18: 300n * E18 },
  SPY: { symbol: "SPY", uid: uid(3), token: address(0x1003), priceUsdE18: 750n * E18 },
  QQQ: { symbol: "QQQ", uid: uid(4), token: address(0x1004), priceUsdE18: 700n * E18 },
  TSLA: { symbol: "TSLA", uid: uid(5), token: address(0x1005), priceUsdE18: 3_333_333_333_333_333_333n * 100n },
};

export const WALLETS = {
  A: address(0xa0),
  B: address(0xb0),
  C: address(0xc0),
  D: address(0xd0),
  E: address(0xe0),
};

export function universe(): Map<AssetUid, Address> {
  return new Map(Object.values(ASSETS).map((a) => [a.uid, a.token]));
}

export function snapshot(overrides: Partial<Record<string, bigint>> = {}, capturedAt = NOW - 10): ValuationSnapshot {
  const prices: PriceSnapshot[] = Object.values(ASSETS).map((a) => ({
    assetUid: a.uid,
    tokenAddress: a.token,
    chainId: 4663,
    priceUsdE18: overrides[a.symbol] ?? a.priceUsdE18,
    source: "CHAINLINK_STOCK_TOKEN_FEED",
    sourceTimestamp: capturedAt,
    stale: false,
  }));
  return buildValuationSnapshot(prices, capturedAt, 300);
}

export const DEFAULT_POLICY: ExecutionPolicy = {
  maxExternalSlippageBps: 50,
  maxReferencePriceDriftBps: 100,
  maxRoundDurationSec: 600,
  allowPartialCross: true,
  allowMarketResidual: true,
  allowLimitResidual: true,
  allowTwapResidual: true,
  allowWaitResidual: true,
  urgency: "NORMAL",
  validUntil: NOW + 3600,
};

export function sell(symbol: string, tokens: bigint): AssetDeltaLimit {
  const a = ASSETS[symbol] as TestAsset;
  return { assetUid: a.uid, token: a.token, maxOutRaw: tokens, maxInRaw: 0n };
}

export function buy(symbol: string, tokens: bigint): AssetDeltaLimit {
  const a = ASSETS[symbol] as TestAsset;
  return { assetUid: a.uid, token: a.token, maxOutRaw: 0n, maxInRaw: tokens };
}

export function intent(
  owner: Address,
  assets: AssetDeltaLimit[],
  snap: ValuationSnapshot,
  overrides: Partial<PortfolioIntent> = {},
  policy: Partial<ExecutionPolicy> = {},
): PortfolioIntent {
  const fullPolicy = { ...DEFAULT_POLICY, ...policy };
  return {
    owner,
    agent: owner,
    circleId: CIRCLE_ID,
    roundId: ROUND_ID,
    valuationSnapshotHash: hashValuationSnapshot(snap),
    policyHash: hashPolicy(fullPolicy),
    policy: fullPolicy,
    assets,
    nonce: 1n,
    validAfter: NOW - 60,
    validUntil: NOW + 600,
    ...overrides,
  };
}

/** Whole tokens -> raw units. */
export const t = (n: number | bigint): bigint => BigInt(n) * E18;
