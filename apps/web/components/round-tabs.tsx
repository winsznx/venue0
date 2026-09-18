"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function RoundTabs({ id, settled }: { id: string; settled: boolean }) {
  const pathname = usePathname();
  const demo = useSearchParams().get("demo") === "1" ? "?demo=1" : "";
  const tabs = [
    { href: `/round/${id}`, label: "Round" },
    { href: `/round/${id}/proposal`, label: "Proposal", disabled: !settled },
    { href: `/round/${id}/execute`, label: "Execution", disabled: !settled },
    { href: `/round/${id}/receipt`, label: "Receipt", disabled: !settled },
  ];
  return (
    <nav aria-label="Round steps" className="tabs">
      {tabs.map((t) =>
        t.disabled ? (
          <span key={t.href} className="tab tab-disabled" aria-disabled="true" title="This round sent no transaction">{t.label}</span>
        ) : (
          <Link key={t.href} href={t.href + demo} className={`tab ${pathname === t.href ? "tab-active" : ""}`} aria-current={pathname === t.href ? "page" : undefined}>{t.label}</Link>
        ),
      )}
    </nav>
  );
}
