import Link from "next/link";
import { IconArrow, IconCheck } from "./icons";

export function StatTile({ icon, label, value, dotLabel, dotValue, dotTone = "cross", href, cta = "See in details" }: { icon: React.ReactNode; label: string; value: React.ReactNode; dotLabel: string; dotValue: React.ReactNode; dotTone?: "cross" | "live" | "neutral" | "warn"; href: string; cta?: string }) {
  return (
    <article className="stat-tile">
      <div className="stat-tile-head">
        <span className="icon-tile">{icon}</span>
        <div>
          <p className="stat-tile-label">{label}</p>
          <p className="stat-tile-value">{value}</p>
        </div>
      </div>
      <div className="stat-tile-row">
        <span className={`status status-${dotTone}`}><span className="status-dot" /></span>
        <span className="muted">{dotLabel}</span>
        <span className={`stat-tile-dotvalue status-${dotTone}`}>{dotValue}</span>
      </div>
      <Link href={href} className="stat-tile-foot">{cta}<IconArrow /></Link>
    </article>
  );
}

export function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`check ${ok ? "check-ok" : "check-bad"}`}>
      <span className="check-mark">{ok ? <IconCheck size={14} /> : "!"}</span>
      <span>{label}</span>
      <span className="sr-only">{ok ? "passed" : "failed"}</span>
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {aside}
    </div>
  );
}

const TONE: Record<string, string> = { PASS: "verified", CROSSED: "cross", PARTIAL_CROSS: "cross", NO_CROSS: "neutral", FILLED: "verified", ORDER_STATUS_FILLED: "verified", FAIL: "fail", INCONCLUSIVE: "warn" };
const WORDS: Record<string, string> = { CROSSED: "Crossed", PARTIAL_CROSS: "Partial cross", NO_CROSS: "No cross", PASS: "Verified", FAIL: "Failed", INCONCLUSIVE: "Inconclusive", ORDER_STATUS_FILLED: "Filled" };

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${TONE[status] ?? "neutral"}`}>{WORDS[status] ?? status}</span>;
}
