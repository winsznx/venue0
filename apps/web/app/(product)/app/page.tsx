import Link from "next/link";
import { IconArrow, IconCircles, IconRound, IconShield } from "@/components/icons";
import { StatTile, StatusBadge } from "@/components/ui";
import { getRound, HERO_ROUND_KEY, proof, rounds } from "@/lib/data";
import { pct, short, usd } from "@/lib/format";

export default function Overview() {
  const hero = getRound(HERO_ROUND_KEY);
  if (!hero) throw new Error("hero round evidence missing");
  const settled = rounds.filter((r) => r.settlement);
  const independentlyVerified = settled.filter((r) => r.independentVerification.some((v) => v.status === "PASS"));
  const heroChecks = hero.verifier?.checks ?? [];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="muted">Everything here comes from verified Robinhood Chain mainnet evidence. The wallets are operator-controlled proof wallets, not users.</p>
        </div>
        <Link href={`/round/${HERO_ROUND_KEY}?demo=1`} className="btn btn-primary">Walk through the verified round</Link>
      </div>

      <div className="grid-3">
        <StatTile icon={<IconRound />} label="Latest verified cycle" value={usd(hero.totals.crossedUsd)} dotLabel="Cross rate" dotValue={pct(hero.totals.crossRateBps)} href={`/round/${hero.key}`} />
        <StatTile icon={<IconShield />} label="Mainnet settlements" value={settled.length} dotTone="live" dotLabel="Independently re-verified" dotValue={`${independentlyVerified.length} / ${settled.length}`} href="/proof" cta="See the evidence" />
        <StatTile icon={<IconCircles />} label="Verifier checks, G2 round" value={`${heroChecks.filter((c) => c.status === "PASS").length} / ${heroChecks.length}`} dotTone="live" dotLabel="Status" dotValue={hero.verifier?.status ?? "none"} href={`/round/${hero.key}/receipt`} cta="Open receipt" />
      </div>

      <div className="section-title"><h2>Verified mainnet rounds</h2><span className="faint">Operator proof wallets · Robinhood Chain</span></div>
      <div className="row-list">
        {rounds.map((r) => (
          <Link key={r.key} href={`/round/${r.key}`} className="row-item">
            <span className="icon-tile"><IconRound /></span>
            <span style={{ minWidth: 0 }}>
              <span className="row-item-title">{r.gate} · {r.participants.map((p) => p.label).join(", ")}</span>
              <span className="row-item-sub" style={{ display: "block" }}>{r.description}</span>
            </span>
            <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <StatusBadge status={r.status} />
              {r.settlement ? <span className="num faint" style={{ fontSize: 13 }}>{short(r.settlement.txHash)}</span> : <span className="faint" style={{ fontSize: 13 }}>no transaction</span>}
              <IconArrow />
            </span>
          </Link>
        ))}
      </div>

      <div className="section-title"><h2>Residual execution</h2></div>
      <div className="grid-2">
        <article className="tile" style={{ padding: 24, display: "grid", gap: 8 }}>
          <span className="badge badge-verified" style={{ justifySelf: "start" }}>Uniswap · executed</span>
          <p className="h3">{proof.uniswap.soldTokens.toFixed(6)} {proof.uniswap.soldSymbol} → {proof.uniswap.receivedTokens.toFixed(6)} {proof.uniswap.receivedSymbol}</p>
          <p className="muted">Residual of a live partial round, routed {proof.uniswap.routing} through Universal Router {proof.uniswap.routerVersion}.</p>
          <a className="link num" href={proof.uniswap.explorer} target="_blank" rel="noreferrer">{short(proof.uniswap.txHash, 10, 6)} ↗</a>
        </article>
        <article className="dark-card">
          <span className="status" style={{ color: "#f3c26b" }}><span className="status-dot" />BOUNDARY CASE</span>
          <p style={{ color: "#fff", fontSize: "1.25rem", fontWeight: 500 }}>Flash limit order filled, but the fee was {(Number(proof.flash.economics.feeBpsOfNotional) / 100).toFixed(1)}% of a {usd(Number(proof.flash.economics.residualNotionalUsd))} residual.</p>
          <p>The residual engine now aggregates residuals like this one into the next round instead.</p>
          <Link href="/round/l6-flash-round/execute" className="btn">See the residual decision</Link>
        </article>
      </div>
    </>
  );
}
