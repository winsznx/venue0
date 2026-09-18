"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Wordmark } from "./brand";
import { IconActivity, IconCircles, IconHome, IconPlay, IconSettings, IconShield, IconWallet } from "./icons";
import styles from "./shell.module.css";

const ICONS = { home: IconHome, wallet: IconWallet, circles: IconCircles, activity: IconActivity, settings: IconSettings, shield: IconShield, play: IconPlay };

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; prefix: string; exact?: boolean };

export const APP_NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: "home", prefix: "/app", exact: true },
  { href: "/portfolio", label: "Portfolio", icon: "wallet", prefix: "/portfolio" },
  { href: "/circles", label: "Circles", icon: "circles", prefix: "/circles" },
  { href: "/activity", label: "Activity", icon: "activity", prefix: "/activity" },
  { href: "/settings", label: "Settings", icon: "settings", prefix: "/settings" },
];

export const PUBLIC_NAV: NavItem[] = [
  { href: "/proof", label: "Proof", icon: "shield", prefix: "/proof" },
  { href: "/demo/round/g2-cycle", label: "Demo replay", icon: "play", prefix: "/demo" },
];

const CRUMB_WORDS: Record<string, string> = { app: "Home", demo: "Demo", round: "Round" };

export function Shell({ children, nav, footer, crumbLabels = {} }: { children: React.ReactNode; nav: NavItem[]; footer: React.ReactNode; crumbLabels?: Record<string, string> }) {
  const pathname = usePathname();
  const router = useRouter();
  const crumbs = pathname.split("/").filter(Boolean).map((c) => crumbLabels[c] ?? CRUMB_WORDS[c] ?? (c.startsWith("0x") ? `${c.slice(0, 6)}…${c.slice(-4)}` : c));
  const active = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.prefix));
  return (
    <div className={styles.frame}>
      <aside className={styles.rail}>
        <div className={styles.brand}><Wordmark /></div>
        <nav aria-label="Primary" className={styles.nav}>
          {nav.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <Link key={item.href} href={item.href} className={`${styles.navItem} ${active(item) ? styles.navActive : ""}`} aria-current={active(item) ? "page" : undefined}>
                <Icon />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className={styles.network}>{footer}</div>
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
