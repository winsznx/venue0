import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";
import { ThresholdSignatureScheme, type ServerKeyShare, type WalletMetadata } from "@dynamic-labs-wallet/node";
import type { Account, Address, Chain, Transport, WalletClient } from "viem";
import { log } from "@venue0/shared";

/**
 * VENUE0 portfolio-agent wallet on Dynamic (server wallet pattern, Sandbox).
 * Dynamic holds one MPC share; the agent backend holds the other. Neither side alone can sign.
 * The backend share is written only to a local gitignored file with 0600 permissions.
 */
export const DEFAULT_AGENT_WALLET_PATH = "keys/dynamic-agent-wallet.json";

type StoredWallet = { address: Address; walletMetadata: WalletMetadata; externalServerKeyShares: ServerKeyShare[]; createdAt: string };

export type DynamicConfig = { environmentId: string; apiToken: string; password: string };

export function dynamicConfigFromEnv(): DynamicConfig {
  const environmentId = process.env.DYNAMIC_ENVIRONMENT_ID;
  const apiToken = process.env.DYNAMIC_API_TOKEN;
  const password = process.env.DYNAMIC_WALLET_PASSWORD;
  if (!environmentId || !apiToken || !password) throw new Error("DYNAMIC_ENVIRONMENT_ID, DYNAMIC_API_TOKEN and DYNAMIC_WALLET_PASSWORD are required");
  return { environmentId, apiToken, password };
}

async function authenticatedClient(config: DynamicConfig): Promise<DynamicEvmWalletClient> {
  const client = new DynamicEvmWalletClient({ environmentId: config.environmentId });
  await client.authenticateApiToken(config.apiToken);
  return client;
}

export async function createAgentWallet(config: DynamicConfig, path = DEFAULT_AGENT_WALLET_PATH): Promise<Address> {
  const existing = await readFile(path, "utf8").catch(() => undefined);
  if (existing) throw new Error(`${path} already exists; refusing to overwrite an agent wallet`);
  const client = await authenticatedClient(config);
  const created = await client.createWalletAccount({
    thresholdSignatureScheme: ThresholdSignatureScheme.TWO_OF_TWO,
    password: config.password,
    backUpToDynamic: true,
  });
  const address = created.walletMetadata.accountAddress as Address;
  const stored: StoredWallet = { address, walletMetadata: created.walletMetadata, externalServerKeyShares: created.externalServerKeyShares, createdAt: new Date().toISOString() };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(stored, null, 2), { mode: 0o600 });
  await chmod(path, 0o600);
  log("dynamic.wallet.created", { address, walletId: created.walletMetadata.walletId });
  return address;
}

/** Returns a viem WalletClient whose signatures are produced by Dynamic MPC, bound to `chain`. */
export async function loadAgentWallet(
  config: DynamicConfig,
  chain: Chain,
  rpcUrl: string,
  path = DEFAULT_AGENT_WALLET_PATH,
): Promise<{ address: Address; walletId: string; client: WalletClient<Transport, Chain, Account> }> {
  const stored = JSON.parse(await readFile(path, "utf8")) as StoredWallet;
  const dynamic = await authenticatedClient(config);
  const client = await dynamic.getWalletClient({
    walletMetadata: stored.walletMetadata,
    password: config.password,
    externalServerKeyShares: stored.externalServerKeyShares,
    chain,
    rpcUrl,
  });
  return { address: stored.address, walletId: stored.walletMetadata.walletId, client };
}
