import { encodeAbiParameters, getAddress, hashStruct, keccak256, recoverTypedDataAddress, type Hex } from "viem";
import { ROBINHOOD_CHAIN_ID, type Address } from "@venue0/shared";
import type { PortfolioIntent } from "@venue0/portfolio";
import { settlementDomain } from "./plan.ts";

export const INTENT_TYPES = {
  AssetDeltaLimit: [
    { name: "token", type: "address" },
    { name: "maxOut", type: "uint256" },
    { name: "maxIn", type: "uint256" },
  ],
  PortfolioIntent: [
    { name: "owner", type: "address" },
    { name: "agent", type: "address" },
    { name: "circleId", type: "bytes32" },
    { name: "roundId", type: "bytes32" },
    { name: "valuationSnapshotHash", type: "bytes32" },
    { name: "policyHash", type: "bytes32" },
    { name: "assets", type: "AssetDeltaLimit[]" },
    { name: "nonce", type: "uint256" },
    { name: "validAfter", type: "uint64" },
    { name: "validUntil", type: "uint64" },
  ],
} as const;

/** Offchain EIP-712 intent under the same VENUE0 domain as plan approvals. Assets are signed in uid order. */
export function intentTypedData(intent: PortfolioIntent, settlementContract: Address, chainId: number = ROBINHOOD_CHAIN_ID) {
  const assets = [...intent.assets]
    .sort((a, b) => (a.assetUid < b.assetUid ? -1 : 1))
    .map((a) => ({ token: getAddress(a.token), maxOut: a.maxOutRaw, maxIn: a.maxInRaw }));
  return {
    domain: settlementDomain(settlementContract, chainId),
    types: INTENT_TYPES,
    primaryType: "PortfolioIntent" as const,
    message: {
      owner: getAddress(intent.owner),
      agent: getAddress(intent.agent),
      circleId: intent.circleId,
      roundId: intent.roundId,
      valuationSnapshotHash: intent.valuationSnapshotHash,
      policyHash: intent.policyHash,
      assets,
      nonce: intent.nonce,
      validAfter: BigInt(intent.validAfter),
      validUntil: BigInt(intent.validUntil),
    },
  };
}

export function intentStructHash(intent: PortfolioIntent, settlementContract: Address): Hex {
  const typed = intentTypedData(intent, settlementContract);
  return hashStruct({ data: typed.message, primaryType: "PortfolioIntent", types: INTENT_TYPES });
}

/** Accepts a signature from the owner or the owner's declared agent. Returns the recovered signer or throws. */
export async function verifyIntentSignature(intent: PortfolioIntent, signature: Hex, settlementContract: Address, chainId: number = ROBINHOOD_CHAIN_ID): Promise<Address> {
  const signer = await recoverTypedDataAddress({ ...intentTypedData(intent, settlementContract, chainId), signature });
  if (signer !== getAddress(intent.owner) && signer !== getAddress(intent.agent)) {
    throw new Error(`intent for ${intent.owner} signed by ${signer}, not owner or agent ${intent.agent}`);
  }
  return signer;
}

/** Deterministic unordered approval nonce: unique per (plan, participant), so a plan can never reuse another plan's nonce. */
export function approvalNonce(planHash: Hex, participant: Address): bigint {
  return BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }], [planHash, getAddress(participant)])));
}
