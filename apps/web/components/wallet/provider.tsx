"use client";

import { DynamicContextProvider, getAuthToken, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/json";

/** Robinhood Chain is the only network Venue0 offers; the array form replaces whatever the Dynamic dashboard lists. */
const ROBINHOOD_CHAIN = {
  chainId: 4663,
  networkId: 4663,
  name: "Robinhood Chain",
  vanityName: "Robinhood Chain",
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com/"],
  iconUrls: ["/icon.svg"],
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

type SessionState = { address: string | null; syncing: boolean; error: string | null };
const SessionContext = createContext<SessionState>({ address: null, syncing: false, error: null });
export const useVenueSession = () => useContext(SessionContext);

/**
 * Keeps the Venue0 session cookie bound to the wallet Dynamic authenticated. When Dynamic has a user and a primary EVM
 * wallet the server session does not match, the Dynamic JWT is exchanged for a new session; on logout both end.
 */
function SessionSync({ serverAddress, children }: { serverAddress: string | null; children: React.ReactNode }) {
  const { user, primaryWallet, sdkHasLoaded } = useDynamicContext();
  const router = useRouter();
  const [state, setState] = useState<SessionState>({ address: serverAddress, syncing: false, error: null });
  const inflight = useRef<string | null>(null);
  const walletAddress = primaryWallet?.address ?? null;

  useEffect(() => {
    if (!sdkHasLoaded || !user || !walletAddress) return;
    if (serverAddress?.toLowerCase() === walletAddress.toLowerCase() || inflight.current === walletAddress) return;
    const token = getAuthToken();
    if (!token) return;
    inflight.current = walletAddress;
    setState((s) => ({ ...s, syncing: true, error: null }));
    api<{ user: { address: string } }>("/api/session", { body: { token, address: walletAddress } })
      .then(({ user: u }) => {
        setState({ address: u.address, syncing: false, error: null });
        router.refresh();
      })
      .catch((error: Error) => {
        inflight.current = null;
        setState((s) => ({ ...s, syncing: false, error: error.message }));
      });
  }, [sdkHasLoaded, user, walletAddress, serverAddress, router]);

  // After sign-out Dynamic's user is gone; a locally synced address from before must not keep the UI "signed in".
  const value = { ...state, address: serverAddress ?? (user ? state.address : null) };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function WalletProvider({ environmentId, serverAddress, children }: { environmentId: string | null; serverAddress: string | null; children: React.ReactNode }) {
  const router = useRouter();
  if (!environmentId) {
    return <SessionContext.Provider value={{ address: serverAddress, syncing: false, error: "Wallet sign-in is not configured on this server (DYNAMIC_ENVIRONMENT_ID)." }}>{children}</SessionContext.Provider>;
  }
  return (
    <DynamicContextProvider
      settings={{
        environmentId,
        appName: "Venue0",
        walletConnectors: [EthereumWalletConnectors],
        overrides: { evmNetworks: [ROBINHOOD_CHAIN] },
        events: {
          onLogout: () => {
            void fetch("/api/session", { method: "DELETE" }).then(() => {
              router.push("/onboarding");
              router.refresh();
            });
          },
        },
      }}
    >
      <SessionSync serverAddress={serverAddress}>{children}</SessionSync>
    </DynamicContextProvider>
  );
}
