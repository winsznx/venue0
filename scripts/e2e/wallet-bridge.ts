/// <reference lib="dom" />
import type { BrowserContext } from "playwright-core";
import { createPublicClient, createWalletClient, decodeFunctionData, erc20Abi, formatEther, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodChain } from "@venue0/shared";

/**
 * A controlled test wallet exposed to the page as an EIP-6963 / EIP-1193 provider. The page talks to it exactly as it
 * would to a browser extension; signing happens here in Node with the test key, which never enters the page.
 */
export async function installWallet(context: BrowserContext, key: Hex, options: { name: string; rpcUrl: string; chainId?: number }) {
  const account = privateKeyToAccount(key);
  const chain = robinhoodChain(options.rpcUrl);
  const publicClient = createPublicClient({ chain, transport: http(options.rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(options.rpcUrl) });
  let chainId = options.chainId ?? 4663;
  const log: string[] = [];

  await context.exposeBinding("__venue0Wallet", async (_source, method: string, params: unknown[] = []) => {
    log.push(method);
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return `0x${chainId.toString(16)}`;
      case "net_version":
        return String(chainId);
      case "wallet_switchEthereumChain": {
        const target = parseInt((params[0] as { chainId: string }).chainId, 16);
        if (target !== 4663) throw new Error(`test wallet only knows Robinhood Chain, not ${target}`);
        chainId = target;
        return null;
      }
      case "wallet_addEthereumChain":
        return null;
      case "wallet_requestPermissions":
      case "wallet_getPermissions":
        return [{ parentCapability: "eth_accounts" }];
      case "personal_sign": {
        const [message] = params as [Hex, string];
        return account.signMessage({ message: { raw: message } });
      }
      case "eth_signTypedData_v4": {
        const [, json] = params as [string, string];
        const typed = JSON.parse(json) as { domain: Record<string, unknown>; types: Record<string, Array<{ name: string; type: string }>>; primaryType: string; message: Record<string, unknown> };
        const { EIP712Domain: _drop, ...types } = typed.types;
        return account.signTypedData({ domain: typed.domain, types, primaryType: typed.primaryType, message: typed.message } as Parameters<typeof account.signTypedData>[0]);
      }
      case "eth_sendTransaction": {
        const [tx] = params as [{ to: Hex; data?: Hex; value?: Hex; gas?: Hex }];
        const gas = await publicClient.estimateGas({ account: account.address, to: tx.to, data: tx.data ?? "0x", value: tx.value ? BigInt(tx.value) : 0n });
        const price = await publicClient.getGasPrice();
        let what = `call ${tx.data?.slice(0, 10)}`;
        try {
          const d = decodeFunctionData({ abi: erc20Abi, data: tx.data ?? "0x" });
          if (d.functionName === "approve") what = `ERC20 approve token=${tx.to} spender=${d.args[0]} exactRaw=${d.args[1]}`;
        } catch {
          what = `call to=${tx.to} selector=${tx.data?.slice(0, 10)}`;
        }
        console.log(`[tx:${options.name}] wallet=${account.address} ${what} gasEstimate=${gas} maxCostEth=${formatEther(gas * price)}`);
        return walletClient.sendTransaction({ to: tx.to, data: tx.data ?? "0x", value: tx.value ? BigInt(tx.value) : 0n, ...(tx.gas ? { gas: BigInt(tx.gas) } : {}) });
      }
      default:
        return publicClient.request({ method: method as never, params: params as never });
    }
  });

  await context.addInitScript(({ name, address }) => {
    const listeners = new Map<string, Set<(...a: unknown[]) => void>>();
    const provider = {
      isMetaMask: false,
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        const result = await (window as unknown as { __venue0Wallet: (m: string, p?: unknown[]) => Promise<unknown> }).__venue0Wallet(method, params ?? []);
        if (method === "wallet_switchEthereumChain") for (const l of listeners.get("chainChanged") ?? []) l((params?.[0] as { chainId: string }).chainId);
        return result;
      },
      on: (event: string, fn: (...a: unknown[]) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)?.add(fn);
        return provider;
      },
      removeListener: (event: string, fn: (...a: unknown[]) => void) => {
        listeners.get(event)?.delete(fn);
        return provider;
      },
      selectedAddress: address,
    };
    const info = { uuid: "5f0f7a4e-6c43-4f6a-9d8e-venue0test0001", name, icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Crect width='8' height='8' fill='%23000'/%3E%3C/svg%3E", rdns: "xyz.venue0.testwallet" };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
    (window as unknown as { ethereum: unknown }).ethereum = provider;
  }, { name: options.name, address: account.address });

  return { address: account.address, log };
}
