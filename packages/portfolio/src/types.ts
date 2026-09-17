import type { Address, AssetUid, Hex } from "@venue0/shared";

export type Holding = {
  owner: Address;
  assetUid: AssetUid;
  token: Address;
  rawBalance: bigint;
};

export type TargetEntry = {
  assetUid: AssetUid;
  targetWeightBps?: number;
  targetValueUsdE18?: bigint;
  minWeightBps?: number;
  maxWeightBps?: number;
};

export type PortfolioTarget = {
  account: Address;
  targets: TargetEntry[];
  cashFloorUsdE18?: bigint;
};

export type ResidualUrgency = "LOW" | "NORMAL" | "HIGH";

export type ExecutionPolicy = {
  maxExternalSlippageBps: number;
  maxReferencePriceDriftBps: number;
  maxRoundDurationSec: number;
  allowPartialCross: boolean;
  minCrossPercentBps?: number;
  allowMarketResidual: boolean;
  allowLimitResidual: boolean;
  allowTwapResidual: boolean;
  allowWaitResidual: boolean;
  maxTwapDurationSec?: number;
  urgency: ResidualUrgency;
  validUntil: number;
};

/**
 * Per-asset bound the owner authorizes for one round. Exactly one side is non-zero:
 * `maxOutRaw` for an asset the owner permits to leave, `maxInRaw` for an asset the owner wants to receive.
 */
export type AssetDeltaLimit = {
  assetUid: AssetUid;
  token: Address;
  maxOutRaw: bigint;
  maxInRaw: bigint;
};

export type PortfolioIntent = {
  owner: Address;
  agent: Address;
  circleId: Hex;
  roundId: Hex;
  valuationSnapshotHash: Hex;
  policyHash: Hex;
  policy: ExecutionPolicy;
  assets: AssetDeltaLimit[];
  nonce: bigint;
  validAfter: number;
  validUntil: number;
};
