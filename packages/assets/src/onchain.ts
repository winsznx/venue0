import type { Address, PublicClient } from "viem";
import { pinnedReadBlock } from "@venue0/shared";
import { accessControlledRegistryAbi, stockTokenAbi } from "./abi.ts";
import type { CanonicalStockToken } from "./canonical.ts";

export type OnchainVerification = {
  uid: string;
  symbol: string;
  contractAddress: Address;
  blockNumber: bigint;
  checkedAt: string;
  observed: {
    bytecodeSize: number;
    symbol: string;
    decimals: number;
    uid: string;
    uiMultiplier: bigint;
    paused: boolean;
    tokenPaused: boolean;
    oraclePaused: boolean;
    registry: Address;
    registryPaused: boolean;
  };
  failures: string[];
  ok: boolean;
};

/** Enforces the PRD asset-selection invariant against live chain state at a pinned block. */
export async function verifyStockTokenOnchain(client: PublicClient, token: CanonicalStockToken): Promise<OnchainVerification> {
  const blockNumber = await pinnedReadBlock(client);
  const address = token.contractAddress;
  const base = { address, abi: stockTokenAbi, blockNumber } as const;

  const [bytecode, symbol, decimals, uid, uiMultiplier, paused, tokenPaused, oraclePaused, registry] = await Promise.all([
    client.getCode({ address, blockNumber }),
    client.readContract({ ...base, functionName: "symbol" }),
    client.readContract({ ...base, functionName: "decimals" }),
    client.readContract({ ...base, functionName: "uid" }),
    client.readContract({ ...base, functionName: "uiMultiplier" }),
    client.readContract({ ...base, functionName: "paused" }),
    client.readContract({ ...base, functionName: "tokenPaused" }),
    client.readContract({ ...base, functionName: "oraclePaused" }),
    client.readContract({ ...base, functionName: "ACCESS_CONTROLLED_REGISTRY" }),
  ]);
  const registryPaused = await client.readContract({
    address: registry,
    abi: accessControlledRegistryAbi,
    functionName: "paused",
    blockNumber,
  });

  const bytecodeSize = bytecode ? (bytecode.length - 2) / 2 : 0;
  const failures: string[] = [];
  if (bytecodeSize === 0) failures.push("no bytecode at canonical address");
  if (symbol !== token.symbol) failures.push(`onchain symbol ${symbol} != API symbol ${token.symbol}`);
  if (decimals !== token.decimals) failures.push(`onchain decimals ${decimals} != API decimals ${token.decimals}`);
  if (uid.toLowerCase() !== token.uid) failures.push(`onchain uid ${uid} != API id ${token.uid}`);
  if (uiMultiplier !== token.currentMultiplierE18) {
    failures.push(`onchain uiMultiplier ${uiMultiplier} != API currentMultiplier ${token.currentMultiplierE18}`);
  }
  if (paused || tokenPaused || registryPaused) failures.push("token or registry is paused");

  return {
    uid: token.uid,
    symbol: token.symbol,
    contractAddress: address,
    blockNumber,
    checkedAt: new Date().toISOString(),
    observed: {
      bytecodeSize,
      symbol,
      decimals,
      uid,
      uiMultiplier,
      paused,
      tokenPaused,
      oraclePaused,
      registry,
      registryPaused,
    },
    failures,
    ok: failures.length === 0,
  };
}

/** Accounts the issuer registry blocks cannot send or receive; settlement preflight must check every leg party. */
export async function findBlockedAccounts(
  client: PublicClient,
  registry: Address,
  accounts: readonly Address[],
): Promise<Address[]> {
  const flags = await Promise.all(
    accounts.map((account) =>
      client.readContract({ address: registry, abi: accessControlledRegistryAbi, functionName: "isBlocked", args: [account] }),
    ),
  );
  return accounts.filter((_, i) => flags[i]);
}
