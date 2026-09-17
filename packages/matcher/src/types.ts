import type { Address, AssetUid, Hex } from "@venue0/shared";
import type { PortfolioIntent, ValuationSnapshot } from "@venue0/portfolio";

export const SOLVER_VERSION = "venue0-mmcc-1";

/** Smallest crossing increment: $0.01 in USD E18. Capacities are floored to whole lots so no leg is sub-cent dust. */
export const DEFAULT_LOT_USD_E18 = 10n ** 16n;

/**
 * A residual below this value ($0.10) is classified DUST: still reported in residual notional, but not counted as an
 * external order, because no venue would execute it. Callers can override per round.
 */
export const DEFAULT_RESIDUAL_DUST_USD_E18 = 10n ** 17n;

export type MatchInput = {
  roundId: Hex;
  snapshot: ValuationSnapshot;
  intents: readonly PortfolioIntent[];
  universe: ReadonlyMap<AssetUid, Address>;
  nowSec: number;
  lotUsdE18?: bigint;
  residualDustUsdE18?: bigint;
};

export type MatchLeg = {
  assetUid: AssetUid;
  token: Address;
  from: Address;
  to: Address;
  lots: bigint;
  amountRaw: bigint;
  valueUsdE18: bigint;
};

export type FillSide = "SELL" | "BUY";

export type ResidualClass = "NONE" | "DUST" | "EXTERNAL";

export type AssetFill = {
  owner: Address;
  assetUid: AssetUid;
  token: Address;
  side: FillSide;
  requestedRaw: bigint;
  crossedRaw: bigint;
  residualRaw: bigint;
  requestedValueUsdE18: bigint;
  crossedValueUsdE18: bigint;
  residualValueUsdE18: bigint;
  residualClass: ResidualClass;
};

export type ParticipantStatus = "CROSSED" | "PARTIAL" | "NOT_CROSSED" | "EXCLUDED_MIN_CROSS" | "REJECTED";

export type ParticipantSummary = {
  owner: Address;
  status: ParticipantStatus;
  reasons: string[];
  valueOutUsdE18: bigint;
  valueInUsdE18: bigint;
  imbalanceUsdE18: bigint;
  requestedNotionalUsdE18: bigint;
  crossedNotionalUsdE18: bigint;
  crossRateBps: bigint;
};

export type RoundMatchStatus = "CROSSED" | "PARTIAL_CROSS" | "NO_CROSS" | "INSUFFICIENT_PARTICIPANTS" | "PLAN_STALE";

export type CycleHop = { from: Address; to: Address; assetUid: AssetUid; lots: bigint };

export type MatchTotals = {
  requestedNotionalUsdE18: bigint;
  crossedNotionalUsdE18: bigint;
  residualNotionalUsdE18: bigint;
  dustResidualNotionalUsdE18: bigint;
  externalResidualCount: number;
  crossRateBps: bigint;
  transferNotionalUsdE18: bigint;
  legCount: number;
  participantCount: number;
  crossingParticipantCount: number;
};

export type MatchResult = {
  solverVersion: string;
  roundId: Hex;
  valuationSnapshotHash: Hex;
  nowSec: number;
  lotUsdE18: bigint;
  residualDustUsdE18: bigint;
  inputHash: Hex;
  status: RoundMatchStatus;
  statusReasons: string[];
  legs: MatchLeg[];
  fills: AssetFill[];
  participants: ParticipantSummary[];
  cycles: CycleHop[][];
  totals: MatchTotals;
  solveMs: number;
  outputHash: Hex;
};
