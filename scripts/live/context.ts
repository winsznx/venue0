import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  keccak256,
  parseAbiItem,
  stringToHex,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { stockTokenAbi } from "@venue0/assets";
import { canonicalJson, log, robinhoodChain, ROBINHOOD_CHAIN_ID, ROBINHOOD_PUBLIC_RPC } from "@venue0/shared";
import { startAnvil, type Anvil } from "../lib/anvil.ts";

export type Mode = "fork" | "live";

export type Environment = "MAINNET_FORK_REHEARSAL" | "ROBINHOOD_CHAIN_MAINNET";

export type Wallet = { label: string; address: Address; client: WalletClient };

export type LiveContext = {
  mode: Mode;
  environment: Environment;
  rpcUrl: string;
  chain: ReturnType<typeof robinhoodChain>;
  publicClient: PublicClient;
  /** Separate client for independent readback. In live mode set VERIFIER_RPC_URL to a different provider. */
  verifierClient: PublicClient;
  wallets: Wallet[];
  deployer: Wallet;
  evidenceDir: (gate: string) => string;
  close: () => void;
};

/**
 * Rehearsal keys derived from a fixed label and used only against a local fork. Anvil's default dev keys are not
 * used because those public addresses carry EIP-7702 delegations on Robinhood Chain mainnet.
 */
const FORK_KEYS: Hex[] = ["A", "B", "C"].map((label) => keccak256(stringToHex(`venue0-fork-rehearsal-wallet-${label}`)));

const LIVE_KEY_ENV = ["VENUE0_WALLET_A_PRIVATE_KEY", "VENUE0_WALLET_B_PRIVATE_KEY", "VENUE0_WALLET_C_PRIVATE_KEY"] as const;

export function parseMode(argv: readonly string[]): Mode {
  const flag = argv.find((a) => a === "--fork" || a === "--live");
  if (!flag) throw new Error("pass --fork (anvil mainnet-fork rehearsal) or --live (broadcast to Robinhood Chain)");
  return flag === "--live" ? "live" : "fork";
}

export async function createContext(mode: Mode, walletCount: number): Promise<LiveContext> {
  let anvil: Anvil | undefined;
  let rpcUrl: string;
  let verifierRpcUrl: string;
  let keys: Hex[];
  const upstream = process.env.ROBINHOOD_RPC_URL ?? ROBINHOOD_PUBLIC_RPC;

  if (mode === "fork") {
    anvil = await startAnvil({ forkUrl: upstream });
    rpcUrl = anvil.rpcUrl;
    verifierRpcUrl = anvil.rpcUrl;
    keys = FORK_KEYS.slice(0, walletCount);
  } else {
    rpcUrl = upstream;
    verifierRpcUrl = process.env.VERIFIER_RPC_URL ?? upstream;
    keys = LIVE_KEY_ENV.slice(0, walletCount).map((name) => {
      const value = process.env[name];
      if (!value) throw new Error(`live mode requires ${name}`);
      return value as Hex;
    });
    if (verifierRpcUrl === rpcUrl) log("live.warning", { detail: "VERIFIER_RPC_URL not set; verifier shares the executor RPC endpoint" });
  }

  const chain = robinhoodChain(rpcUrl);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
  const verifierClient = createPublicClient({ chain: robinhoodChain(verifierRpcUrl), transport: http(verifierRpcUrl) }) as PublicClient;
  const chainId = await publicClient.getChainId();
  if (chainId !== ROBINHOOD_CHAIN_ID) throw new Error(`connected chain ${chainId} is not Robinhood Chain ${ROBINHOOD_CHAIN_ID}`);

  const labels = ["A", "B", "C"];
  const wallets = keys.map((key, i) => {
    const account = privateKeyToAccount(key);
    return { label: labels[i] as string, address: account.address, client: createWalletClient({ account, chain, transport: http(rpcUrl) }) };
  });
  let deployer = wallets[0] as Wallet;
  if (mode === "live" && process.env.VENUE0_DEPLOYER_PRIVATE_KEY) {
    const account = privateKeyToAccount(process.env.VENUE0_DEPLOYER_PRIVATE_KEY as Hex);
    deployer = { label: "DEPLOYER", address: account.address, client: createWalletClient({ account, chain, transport: http(rpcUrl) }) };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const context: LiveContext = {
    mode,
    environment: mode === "fork" ? "MAINNET_FORK_REHEARSAL" : "ROBINHOOD_CHAIN_MAINNET",
    rpcUrl,
    chain,
    publicClient,
    verifierClient,
    wallets,
    deployer,
    evidenceDir: (gate) => (mode === "fork" ? join("evidence", "rehearsal", "fork", gate, stamp) : join("evidence", "live", gate, stamp)),
    close: () => anvil?.stop(),
  };
  if (mode === "fork") for (const wallet of wallets) await forkFundEth(context, wallet.address);
  return context;
}

export async function writeArtifact(dir: string, name: string, value: unknown): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(path, `${canonicalJson(value, 2)}\n`);
  return path;
}

/** Raw JSON-RPC for anvil-only methods that viem's typed clients do not expose. */
async function anvilRpc(ctx: LiveContext, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(ctx.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/**
 * Fork-only funding: finds a current holder of `token` from recent Transfer logs on the fork and impersonates it.
 * Refuses to run in live mode.
 */
export async function forkFund(ctx: LiveContext, token: Address, recipient: Address, amount: bigint): Promise<void> {
  if (ctx.mode !== "fork") throw new Error("forkFund is only available against a local fork");
  const head = await ctx.publicClient.getBlockNumber();
  const logs = await ctx.publicClient.getLogs({
    address: token,
    event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
    fromBlock: head - 5_000n,
    toBlock: head,
  });
  const candidates = [...new Set(logs.map((l) => l.args.to).filter((a): a is Address => Boolean(a)))].reverse();
  for (const holder of candidates) {
    const balance = await ctx.publicClient.readContract({ address: token, abi: stockTokenAbi, functionName: "balanceOf", args: [holder] });
    if (balance < amount) continue;
    await anvilRpc(ctx, "anvil_impersonateAccount", [holder]);
    await anvilRpc(ctx, "anvil_setBalance", [holder, "0x8AC7230489E80000"]);
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient, amount] });
    const hash = (await anvilRpc(ctx, "eth_sendTransaction", [{ from: holder, to: token, data }])) as Hex;
    const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
    await anvilRpc(ctx, "anvil_stopImpersonatingAccount", [holder]);
    if (receipt.status !== "success") throw new Error(`fork funding transfer from ${holder} reverted`);
    return;
  }
  throw new Error(`no recent holder of ${token} with at least ${amount}`);
}

export async function forkFundEth(ctx: LiveContext, address: Address): Promise<void> {
  if (ctx.mode !== "fork") throw new Error("forkFundEth is only available against a local fork");
  await anvilRpc(ctx, "anvil_setBalance", [getAddress(address), "0x8AC7230489E80000"]);
}
