"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import styles from "@/components/shell.module.css";
import { useVenueSession } from "./provider";

/** Rail footer in the product: the signed-in wallet, its network, and disconnect. */
export function WalletCard() {
  const { address, error } = useVenueSession();
  const { primaryWallet, handleLogOut, sdkHasLoaded } = useDynamicContext();
  const mismatch = Boolean(sdkHasLoaded && primaryWallet && address && primaryWallet.address.toLowerCase() !== address.toLowerCase());
  return (
    <>
      <span className="status status-live"><span className="status-dot" />ROBINHOOD CHAIN · 4663</span>
      <p className={styles.networkTitle}>{primaryWallet?.connector?.name ?? "Wallet"}</p>
      <p className={`${styles.walletAddr} num`} title={address ?? undefined}>{address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "Not connected"}</p>
      {mismatch && <p className={styles.walletAddr}>Your wallet switched accounts. Re-verifying…</p>}
      {error && <p className={styles.walletAddr}>{error}</p>}
      <button type="button" className={`btn btn-sm ${styles.railQuiet}`} onClick={() => void handleLogOut()}>Disconnect</button>
    </>
  );
}
