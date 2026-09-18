"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { useCallback } from "react";
import type { Hex, TypedDataDefinition } from "viem";

export const ROBINHOOD_CHAIN_ID = 4663;

export class SignerError extends Error {}

/**
 * Signing and sending from the user's own Dynamic wallet (embedded or external). Every call first confirms the wallet
 * is on Robinhood Chain and switches it if not; the server never sees a key.
 */
export function useSigner() {
  const { primaryWallet } = useDynamicContext();

  const wallet = useCallback(async () => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) throw new SignerError("Connect an EVM wallet first.");
    const network = await primaryWallet.getNetwork();
    if (Number(network) !== ROBINHOOD_CHAIN_ID) {
      try {
        await primaryWallet.switchNetwork(ROBINHOOD_CHAIN_ID);
      } catch (error) {
        throw new SignerError(`Your wallet is on chain ${network}. Switch it to Robinhood Chain (4663) to continue. ${(error as Error).message}`);
      }
    }
    return primaryWallet;
  }, [primaryWallet]);

  const signTypedData = useCallback(
    async (typedData: TypedDataDefinition): Promise<Hex> => {
      const w = await wallet();
      const client = await w.getWalletClient(String(ROBINHOOD_CHAIN_ID));
      return client.signTypedData({ ...typedData, account: client.account } as Parameters<typeof client.signTypedData>[0]);
    },
    [wallet],
  );

  /** Sends a transaction and waits for its receipt; a revert is thrown, not returned. */
  const send = useCallback(
    async (tx: { to: Hex; data: Hex; value?: bigint | string; gas?: bigint | string }): Promise<Hex> => {
      const w = await wallet();
      const client = await w.getWalletClient(String(ROBINHOOD_CHAIN_ID));
      const hash = await client.sendTransaction({ account: client.account, chain: client.chain, to: tx.to, data: tx.data, value: BigInt(tx.value ?? 0), ...(tx.gas ? { gas: BigInt(tx.gas) } : {}) });
      const publicClient = await w.getPublicClient();
      if (!publicClient) throw new SignerError("Could not read the chain from this wallet.");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new SignerError(`Transaction ${hash} reverted.`);
      return hash;
    },
    [wallet],
  );

  return { address: primaryWallet?.address ?? null, signTypedData, send };
}

/** Wallet errors carry long provider dumps; users see the first sentence, with rejections named plainly. */
export function walletErrorMessage(error: unknown): string {
  const message = (error as Error)?.message ?? String(error);
  if (/reject|denied|cancel/i.test(message)) return "You declined the request in your wallet. Nothing was signed or sent.";
  return message.split("\n")[0]?.slice(0, 240) ?? "Wallet error";
}
