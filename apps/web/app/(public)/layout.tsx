import Link from "next/link";
import { PUBLIC_NAV, Shell } from "@/components/shell";
import { proof } from "@/lib/data";
import styles from "@/components/shell.module.css";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const contract = proof.settlementContract;
  return (
    <Shell
      nav={PUBLIC_NAV}
      footer={
        <>
          <span className="status status-live"><span className="status-dot" />LIVE · ROBINHOOD CHAIN</span>
          <p className={styles.networkTitle}>Settlement contract</p>
          <a className={`${styles.networkLink} num`} href={contract.explorer} target="_blank" rel="noreferrer">
            {contract.address.slice(0, 8)}…{contract.address.slice(-6)} <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens on Blockscout)</span>
          </a>
          <Link href="/app" className={`btn btn-sm ${styles.railCta}`}>Enter Venue0</Link>
        </>
      }
    >
      {children}
    </Shell>
  );
}
