import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CrossingGraph } from "@/components/crossing-graph";
import { IconCheck } from "@/components/icons";
import { RoundTabs } from "@/components/round-tabs";
import { Check } from "@/components/ui";
import { getRound } from "@/lib/data";
import { residualOutcome } from "@/lib/residual-outcome";
import { pct, ratio, short, usd } from "@/lib/format";
import styles from "./receipt.module.css";

export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const round = getRound(id);
  if (!round || !round.settlement || !round.verifier) notFound();
  const verified = round.verifier.status === "PASS";
  const t = round.totals;
  const externalUsd = round.fills.filter((f) => f.residualClass === "EXTERNAL").reduce((s, f) => s + f.residualUsd, 0);
  const weighted = (key: "allocationErrorBeforeBps" | "allocationErrorAfterBps") => {
    const ps = round.participants.filter((p) => p.valueUsd && p[key] !== null);
    const total = ps.reduce((s, p) => s + (p.valueUsd ?? 0), 0);
    return total > 0 ? ps.reduce((s, p) => s + (p[key] ?? 0) * (p.valueUsd ?? 0), 0) / total : 0;
  };
  const netDeltaOk = round.verifier.checks.find((c) => c.name === "balances.netDelta")?.status === "PASS";
  const independent = round.independentVerification.find((v) => v.status === "PASS");
  const outcome = residualOutcome(round);
  const market = round.comparison.marketOnly.externalOrders;
  const venue0 = round.comparison.venue0.externalOrders;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}><Suspense><RoundTabs id={round.key} settled /></Suspense></div>
      <article className={styles.sheet} aria-labelledby="receipt-title">
        <header className={styles.head}>
          <span className={`${styles.seal} ${verified ? styles.sealOk : styles.sealBad}`}>{verified ? <IconCheck size={30} /> : "!"}</span>
          <div>
            <h1 id="receipt-title" className={styles.title}>{verified ? "Round complete" : "Verification failed"}</h1>
            <p className="muted">
              <span className="num">{short(round.roundId, 8, 6)}</span> · {round.participants.length} portfolios · {round.assets.length} Stock Tokens · Robinhood Chain · {round.capturedAt.slice(0, 10)}
            </p>
          </div>
          <span className={`badge ${verified ? "badge-verified" : "badge-fail"} ${styles.stamp}`}>{verified ? "VERIFIED" : "NOT VERIFIED"}</span>
        </header>

        <section className={styles.figures} aria-label="Financial summary">
          <div><p className={styles.figLabel}>Requested rebalance</p><p className={styles.fig}>{usd(t.requestedUsd)}</p></div>
          <div><p className={styles.figLabel}>Crossed before market</p><p className={`${styles.fig} ${styles.figCross}`}>{usd(t.crossedUsd)}</p></div>
          <div><p className={styles.figLabel}>External residual</p><p className={styles.fig}>{usd(externalUsd)}</p>{t.dustUsd > 0 && <p className="faint" style={{ fontSize: 13 }}>+{usd(t.dustUsd)} rounding dust kept</p>}</div>
          <div><p className={styles.figLabel}>Cross rate</p><p className={styles.fig}>{pct(t.crossRateBps)}</p></div>
        </section>

        <section className={styles.compare} aria-label="External orders compared">
          <div className={styles.compareCol}>
            <p className={styles.figLabel}>Market only</p>
            <p className={styles.compareNum}><span className="num">{market}</span> external orders</p>
            <div className={styles.bar}><span style={{ width: "100%" }} className={styles.barMarket} /></div>
          </div>
          <div className={styles.compareCol}>
            <p className={styles.figLabel}>Venue0</p>
            <p className={styles.compareNum}><span className="num">{venue0}</span> external orders</p>
            <div className={styles.bar}><span style={{ width: `${Math.max(2, (venue0 / market) * 100)}%` }} className={styles.barVenue} /></div>
          </div>
          <div className={styles.compareCol}>
            <p className={styles.figLabel}>Final target error</p>
            <p className={styles.compareNum}><span className="num">{pct(weighted("allocationErrorBeforeBps"))}</span> → <span className="num">{pct(weighted("allocationErrorAfterBps"))}</span></p>
            <p className="faint" style={{ fontSize: 13 }}>value-weighted distance from each portfolio&apos;s target</p>
          </div>
        </section>

        <section className={styles.verify} aria-labelledby="verify-title">
          <h2 id="verify-title" className={styles.sectionTitle}>Verification</h2>
          <div className={styles.checks}>
            {round.participants.map((p) => {
              const nonce = round.verifier?.checks.find((c) => c.name === `event.NonceConsumed.${p.address}`)?.status === "PASS";
              return <Check key={p.address} ok={netDeltaOk && nonce} label={`${p.label} balances and approval`} />;
            })}
            <Check ok={round.settlement.status === "success"} label="Atomic settlement" />
            <Check ok={Boolean(independent)} label={independent ? `Independent readback via ${independent.provider}` : "Independent readback"} />
          </div>
          <a className="link num" href={round.settlement.explorer} target="_blank" rel="noreferrer">
            Settlement transaction {short(round.settlement.txHash, 10, 8)} ↗<span className="sr-only"> (opens on Blockscout)</span>
          </a>
        </section>

        <section aria-labelledby="cleared-title">
          <h2 id="cleared-title" className={styles.sectionTitle}>How Venue0 cleared the round</h2>
          <div className={styles.graph}><CrossingGraph round={round} mode="VENUE0" animate={false} caption="Transfers Venue0 settled in this round" /></div>
        </section>

        <section aria-labelledby="residual-outcome-title">
          <h2 id="residual-outcome-title" className={styles.sectionTitle}>Residual outcome</h2>
          <p className={styles.residual}>
            {outcome.kind === "DUST_ONLY" && <>No external order. {usd(outcome.dustUsd)} of rounding dust stayed in the wallets.</>}
            {outcome.kind === "NO_RESIDUAL" && <>Everything crossed.</>}
            {outcome.kind === "UNISWAP_EXECUTED" && <>Residual executed on Uniswap: {outcome.detail}. <a className="link num" href={outcome.explorer} target="_blank" rel="noreferrer">{short(outcome.txHash)} ↗</a></>}
            {outcome.kind === "FLASH_BOUNDARY" && <>Flash limit order filled, but the fixed fee was {(outcome.feeBps / 100).toFixed(1)}% of a {usd(outcome.notionalUsd)} residual. The current residual engine would aggregate it into the next round.</>}
            {outcome.kind === "NOT_EXECUTED" && <>{usd(outcome.externalUsd)} of residual was not executed in this proof run and stayed in the wallets.</>}
          </p>
        </section>

        <footer className={styles.foot}>
          <span>Plan <span className="num">{short(round.plan?.planHash ?? "", 8, 6)}</span></span>
          <span>Snapshot <span className="num">{short(round.snapshot.hash, 8, 6)}</span> ({round.snapshot.source.toLowerCase().replaceAll("_", " ")})</span>
          <span>Gas <span className="num">{round.settlement.gasUsed.toLocaleString()}</span></span>
          <span>Cross rate pooled over requested orders: {ratio(t.crossedUsd / t.requestedUsd)}</span>
          <span>Operator proof wallets, not users.</span>
        </footer>
      </article>
    </>
  );
}
