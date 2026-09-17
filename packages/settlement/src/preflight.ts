import type { Address, PublicClient } from "viem";
import { accessControlledRegistryAbi, stockTokenAbi } from "@venue0/assets";
import { venue0SettlementAbi } from "./generated/venue0-settlement.ts";
import { requiredOutflows, type SettlementPlan } from "./plan.ts";

export type PreflightIssue = { kind: "BALANCE" | "ALLOWANCE" | "PAUSED" | "BLOCKED" | "EXPIRED" | "SETTLED" | "NONCE"; detail: string };

export type PreflightReport = { blockNumber: bigint; issues: PreflightIssue[]; ok: boolean };

/**
 * Re-reads chain state immediately before submission (PRD 27.1 "balance changes after solve").
 * A failing preflight means re-solve, not submit.
 */
export async function preflightSettlement(
  client: PublicClient,
  plan: SettlementPlan,
  nonces: ReadonlyMap<Address, bigint>,
  nowSec: number,
  options: { stockTokenIssuerControls?: boolean } = {},
): Promise<PreflightReport> {
  const issues: PreflightIssue[] = [];
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const at = { blockNumber } as const;

  if (BigInt(nowSec) > plan.contractPlan.validUntil) issues.push({ kind: "EXPIRED", detail: `plan expired at ${plan.contractPlan.validUntil}` });

  const settled = await client.readContract({
    address: plan.settlementContract,
    abi: venue0SettlementAbi,
    functionName: "planSettled",
    args: [plan.planHash],
    ...at,
  });
  if (settled) issues.push({ kind: "SETTLED", detail: `plan ${plan.planHash} already settled` });

  for (const participant of plan.contractPlan.participants) {
    const nonce = nonces.get(participant);
    if (nonce === undefined) {
      issues.push({ kind: "NONCE", detail: `no nonce for ${participant}` });
      continue;
    }
    const used = await client.readContract({
      address: plan.settlementContract,
      abi: venue0SettlementAbi,
      functionName: "nonceUsed",
      args: [participant, nonce],
      ...at,
    });
    if (used) issues.push({ kind: "NONCE", detail: `nonce ${nonce} already used by ${participant}` });
  }

  for (const [key, amount] of requiredOutflows(plan)) {
    const [owner, token] = key.split("|") as [Address, Address];
    const [balance, allowance] = await Promise.all([
      client.readContract({ address: token, abi: stockTokenAbi, functionName: "balanceOf", args: [owner], ...at }),
      client.readContract({ address: token, abi: stockTokenAbi, functionName: "allowance", args: [owner, plan.settlementContract], ...at }),
    ]);
    if (balance < amount) issues.push({ kind: "BALANCE", detail: `${owner} holds ${balance} of ${token}, plan needs ${amount}` });
    if (allowance < amount) issues.push({ kind: "ALLOWANCE", detail: `${owner} approved ${allowance} of ${token}, plan needs ${amount}` });
  }

  const checkIssuerControls = options.stockTokenIssuerControls ?? true;
  const tokens = checkIssuerControls ? [...new Set(plan.contractPlan.legs.map((l) => l.token))] : [];
  for (const token of tokens) {
    const [paused, tokenPaused, registry] = await Promise.all([
      client.readContract({ address: token, abi: stockTokenAbi, functionName: "paused", ...at }),
      client.readContract({ address: token, abi: stockTokenAbi, functionName: "tokenPaused", ...at }),
      client.readContract({ address: token, abi: stockTokenAbi, functionName: "ACCESS_CONTROLLED_REGISTRY", ...at }),
    ]);
    const registryPaused = await client.readContract({ address: registry, abi: accessControlledRegistryAbi, functionName: "paused", ...at });
    if (paused || tokenPaused || registryPaused) issues.push({ kind: "PAUSED", detail: `${token} paused (token=${paused || tokenPaused}, registry=${registryPaused})` });
    for (const account of [...plan.contractPlan.participants, plan.settlementContract]) {
      const blocked = await client.readContract({ address: registry, abi: accessControlledRegistryAbi, functionName: "isBlocked", args: [account], ...at });
      if (blocked) issues.push({ kind: "BLOCKED", detail: `${account} is blocked by registry ${registry}` });
    }
  }

  return { blockNumber, issues, ok: issues.length === 0 };
}
