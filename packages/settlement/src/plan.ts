import { getAddress, hashStruct, keccak256, stringToHex, type TypedDataDomain } from "viem";
import { canonicalJson, ROBINHOOD_CHAIN_ID, type Address, type AssetUid, type Hex } from "@venue0/shared";
import type { AssetFill, MatchResult, ParticipantSummary, ResidualClass } from "@venue0/matcher";

export const PLAN_TYPES = {
  Leg: [
    { name: "token", type: "address" },
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  SettlementPlan: [
    { name: "roundId", type: "bytes32" },
    { name: "planId", type: "bytes32" },
    { name: "valuationSnapshotHash", type: "bytes32" },
    { name: "validAfter", type: "uint64" },
    { name: "validUntil", type: "uint64" },
    { name: "participants", type: "address[]" },
    { name: "legs", type: "Leg[]" },
  ],
  PlanApproval: [
    { name: "participant", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "plan", type: "SettlementPlan" },
  ],
} as const;

export type ContractLeg = { token: Address; from: Address; to: Address; amount: bigint };

/** Exactly the struct the contract hashes and executes. */
export type ContractPlan = {
  roundId: Hex;
  planId: Hex;
  valuationSnapshotHash: Hex;
  validAfter: bigint;
  validUntil: bigint;
  participants: Address[];
  legs: ContractLeg[];
};

export type SettlementLeg = ContractLeg & { assetUid: AssetUid };

export type ResidualOrder = {
  owner: Address;
  assetUid: AssetUid;
  token: Address;
  side: "BUY" | "SELL";
  amountRaw: bigint;
  notionalUsdE18: bigint;
  residualClass: ResidualClass;
};

/** Offchain plan shown to participants. `contractPlan` is the only part that moves tokens. */
export type SettlementPlan = {
  chainId: typeof ROBINHOOD_CHAIN_ID;
  settlementContract: Address;
  planHash: Hex;
  contractPlan: ContractPlan;
  legs: SettlementLeg[];
  participantSummaries: ParticipantSummary[];
  residuals: ResidualOrder[];
  matchOutputHash: Hex;
  solverVersion: string;
  generatedAt: number;
};

export function settlementDomain(settlementContract: Address, chainId: number = ROBINHOOD_CHAIN_ID): TypedDataDomain {
  return { name: "VENUE0", version: "1", chainId, verifyingContract: settlementContract };
}

const lower = (a: string) => a.toLowerCase();

export function compareLegs(a: ContractLeg, b: ContractLeg): number {
  for (const key of ["token", "from", "to"] as const) {
    if (lower(a[key]) !== lower(b[key])) return lower(a[key]) < lower(b[key]) ? -1 : 1;
  }
  return 0;
}

export function hashContractPlan(plan: ContractPlan): Hex {
  return hashStruct({ data: plan, primaryType: "SettlementPlan", types: PLAN_TYPES });
}

export type BuildPlanOptions = {
  settlementContract: Address;
  validAfter: number;
  validUntil: number;
  generatedAt: number;
  chainId?: number;
};

/** Converts a crossing result into the canonical contract plan: participants ascending, legs ascending by (token, from, to). */
export function buildSettlementPlan(match: MatchResult, options: BuildPlanOptions): SettlementPlan {
  if (match.legs.length === 0) throw new Error(`round ${match.roundId} has no legs to settle (status ${match.status})`);
  if (options.validUntil <= options.validAfter) throw new Error("plan validity window is empty");

  const merged = new Map<string, SettlementLeg>();
  for (const leg of match.legs) {
    const key = `${lower(leg.token)}|${lower(leg.from)}|${lower(leg.to)}`;
    const existing = merged.get(key);
    if (existing) existing.amount += leg.amountRaw;
    else merged.set(key, { token: getAddress(leg.token), from: getAddress(leg.from), to: getAddress(leg.to), amount: leg.amountRaw, assetUid: leg.assetUid });
  }
  const legs = [...merged.values()].sort(compareLegs);
  const participants = [...new Set(legs.flatMap((l) => [l.from, l.to]))].sort((a, b) => (lower(a) < lower(b) ? -1 : 1));

  const contractPlan: ContractPlan = {
    roundId: match.roundId,
    planId: keccak256(stringToHex(canonicalJson({ matchOutputHash: match.outputHash, validAfter: options.validAfter, validUntil: options.validUntil }))),
    valuationSnapshotHash: match.valuationSnapshotHash,
    validAfter: BigInt(options.validAfter),
    validUntil: BigInt(options.validUntil),
    participants,
    legs: legs.map(({ token, from, to, amount }) => ({ token, from, to, amount })),
  };

  return {
    chainId: ROBINHOOD_CHAIN_ID,
    settlementContract: getAddress(options.settlementContract),
    planHash: hashContractPlan(contractPlan),
    contractPlan,
    legs,
    participantSummaries: match.participants,
    residuals: match.fills.filter((f) => f.residualRaw > 0n).map(toResidual),
    matchOutputHash: match.outputHash,
    solverVersion: match.solverVersion,
    generatedAt: options.generatedAt,
  };
}

function toResidual(fill: AssetFill): ResidualOrder {
  return {
    owner: fill.owner,
    assetUid: fill.assetUid,
    token: fill.token,
    side: fill.side,
    amountRaw: fill.residualRaw,
    notionalUsdE18: fill.residualValueUsdE18,
    residualClass: fill.residualClass,
  };
}

export function approvalTypedData(plan: SettlementPlan, participant: Address, nonce: bigint, chainId: number = ROBINHOOD_CHAIN_ID) {
  return {
    domain: settlementDomain(plan.settlementContract, chainId),
    types: PLAN_TYPES,
    primaryType: "PlanApproval" as const,
    message: { participant: getAddress(participant), nonce, plan: plan.contractPlan },
  };
}

/** Net raw delta per (participant, token) implied by the plan. The verifier compares observed balances to this. */
export function expectedNetDeltas(plan: Pick<SettlementPlan, "contractPlan">): Map<string, bigint> {
  const deltas = new Map<string, bigint>();
  for (const leg of plan.contractPlan.legs) {
    const out = `${lower(leg.from)}|${lower(leg.token)}`;
    const inn = `${lower(leg.to)}|${lower(leg.token)}`;
    deltas.set(out, (deltas.get(out) ?? 0n) - leg.amount);
    deltas.set(inn, (deltas.get(inn) ?? 0n) + leg.amount);
  }
  return deltas;
}

/** Total raw amount each participant must have approved and hold per token. */
export function requiredOutflows(plan: Pick<SettlementPlan, "contractPlan">): Map<string, bigint> {
  const required = new Map<string, bigint>();
  for (const leg of plan.contractPlan.legs) {
    const key = `${lower(leg.from)}|${lower(leg.token)}`;
    required.set(key, (required.get(key) ?? 0n) + leg.amount);
  }
  return required;
}
