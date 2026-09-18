"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Wordmark } from "./brand";
import { IconCircles, IconHome, IconRound, IconShield, IconWallet } from "./icons";
import styles from "./shell.module.css";

const NAV = [
  { href: "/app", label: "Overview", icon: IconHome, match: (p: string) => p === "/app" },
  { href: "/portfolio", label: "Portfolio", icon: IconWallet, match: (p: string) => p.startsWith("/portfolio") },
  { href: "/circles", label: "Circles", icon: IconCircles, match: (p: string) => p.startsWith("/circles") },
  { href: "/round/g2-cycle", label: "Rounds", icon: IconRound, match: (p: string) => p.startsWith("/round") },
  { href: "/proof", label: "Proof", icon: IconShield, match: (p: string) => p.startsWith("/proof") },
];

export function Shell({ children, contract }: { children: React.ReactNode; contract: { address: string; explorer: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const crumbs = pathname.split("/").filter(Boolean);
  return (
    <div className={styles.frame}>
      <aside className={styles.rail}>
        <div className={styles.brand}><Wordmark /></div>
        <nav aria-label="Product" className={styles.nav}>
          {NAV.map(({ href, label, icon: Icon, match }) => (
            <Link key={href} href={href} className={`${styles.navItem} ${match(pathname) ? styles.navActive : ""}`} aria-current={match(pathname) ? "page" : undefined}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className={styles.network}>
          <span className="status status-live"><span className="status-dot" />LIVE · ROBINHOOD CHAIN</span>
          <p className={styles.networkTitle}>Settlement contract</p>
          <a className={`${styles.networkLink} num`} href={contract.explorer} target="_blank" rel="noreferrer">
            {contract.address.slice(0, 8)}…{contract.address.slice(-6)} <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens on Blockscout)</span>
          </a>
        </div>
      </aside>
      <main className={styles.main}>
        <div className={styles.topbar}>
          <button type="button" className={styles.navBtn} onClick={() => router.back()} aria-label="Back">‹</button>
          <button type="button" className={styles.navBtn} onClick={() => router.forward()} aria-label="Forward">›</button>
          <span className={styles.divider} />
          <nav aria-label="Breadcrumb" className={styles.crumbs}>
            {crumbs.map((c, i) => (
              <span key={c + i} className={i === crumbs.length - 1 ? styles.crumbCurrent : ""}>{i > 0 && <span className={styles.crumbSep}>/</span>}{c}</span>
            ))}
          </nav>
        </div>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
