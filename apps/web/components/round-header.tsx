import type { Round } from "@/lib/data";
import { short } from "@/lib/format";
import { StatusBadge } from "./ui";
import { RoundTabs } from "./round-tabs";

export function RoundHeader({ round }: { round: Round }) {
  const live = round.environment === "ROBINHOOD_CHAIN_MAINNET";
  return (
    <header className="page-head" style={{ alignItems: "flex-start" }}>
      <div style={{ display: "grid", gap: 10 }}>
        <span className="badge badge-neutral" style={{ justifySelf: "start" }}>{live ? "REPLAY OF VERIFIED MAINNET ROUND" : "REHEARSAL"}</span>
        <h1>Venue0 round <span className="num" style={{ fontSize: "0.7em", fontWeight: 400 }}>{short(round.roundId, 8, 6)}</span></h1>
        <p className="muted" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <span>{round.gate}</span>
          <span>{round.participants.length} portfolios</span>
          <span>{round.assets.length} Stock Tokens</span>
          <StatusBadge status={round.status} />
        </p>
        <p className="faint" style={{ maxWidth: "70ch", fontSize: "0.9375rem" }}>{round.description}</p>
      </div>
      <RoundTabs id={round.key} settled={Boolean(round.settlement)} />
    </header>
  );
}
