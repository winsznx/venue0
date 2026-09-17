import { getAddress } from "viem";
import { hashCanonical, type Hex } from "@venue0/shared";
import type { AssetDeltaLimit, ExecutionPolicy, PortfolioIntent } from "./types.ts";

export function hashPolicy(policy: ExecutionPolicy): Hex {
  return hashCanonical(policy);
}

export function hashIntent(intent: PortfolioIntent): Hex {
  return hashCanonical(intent);
}

export type IntentProblem = { owner: string; reason: string };

/** Structural and temporal validation. Returns reasons; an empty list means the intent may enter the round. */
export function intentProblems(
  intent: PortfolioIntent,
  context: { roundId: Hex; valuationSnapshotHash: Hex; nowSec: number; knownTokens: ReadonlyMap<string, string> },
): IntentProblem[] {
  const problems: string[] = [];
  if (intent.roundId !== context.roundId) problems.push("intent is for a different round");
  if (intent.valuationSnapshotHash !== context.valuationSnapshotHash) problems.push("intent references a different valuation snapshot");
  if (intent.policyHash !== hashPolicy(intent.policy)) problems.push("policyHash does not match policy");
  if (context.nowSec < intent.validAfter) problems.push("intent not yet valid");
  if (context.nowSec > intent.validUntil) problems.push("intent expired");
  if (context.nowSec > intent.policy.validUntil) problems.push("policy expired");
  if (intent.assets.length === 0) problems.push("intent has no assets");

  const seen = new Set<string>();
  let sells = 0;
  let buys = 0;
  for (const limit of intent.assets) {
    problems.push(...limitProblems(limit, context.knownTokens));
    if (seen.has(limit.assetUid)) problems.push(`duplicate asset ${limit.assetUid}`);
    seen.add(limit.assetUid);
    if (limit.maxOutRaw > 0n) sells++;
    if (limit.maxInRaw > 0n) buys++;
  }
  if (intent.assets.length > 0 && (sells === 0 || buys === 0)) {
    problems.push("asset-for-asset crossing needs at least one sell and one buy");
  }
  return problems.map((reason) => ({ owner: intent.owner, reason }));
}

function limitProblems(limit: AssetDeltaLimit, knownTokens: ReadonlyMap<string, string>): string[] {
  const problems: string[] = [];
  const expectedToken = knownTokens.get(limit.assetUid);
  if (!expectedToken) problems.push(`asset ${limit.assetUid} is not in the round universe`);
  else if (getAddress(expectedToken) !== getAddress(limit.token)) problems.push(`token ${limit.token} is not the canonical address for ${limit.assetUid}`);
  if (limit.maxOutRaw < 0n || limit.maxInRaw < 0n) problems.push(`negative limit for ${limit.assetUid}`);
  if ((limit.maxOutRaw > 0n) === (limit.maxInRaw > 0n)) problems.push(`asset ${limit.assetUid} must be exactly one of sell or buy`);
  return problems;
}
