"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Round } from "@/lib/data";
import { pct, ratio, usd } from "@/lib/format";
import { CrossingGraph, edgesFor, type GraphMode } from "./crossing-graph";
import styles from "./round-view.module.css";

const MODES: Array<{ id: GraphMode; label: string; guide: string }> = [
  { id: "MARKET", label: "MARKET ONLY", guide: "Every wallet sends its own buys and sells to public liquidity." },
  { id: "PAIRWISE", label: "PAIRWISE", guide: "Only direct two-wallet complements match. This is the best any pairwise matcher could do with these intents." },
  { id: "VENUE0", label: "VENUE0", guide: "Venue0 looks across all portfolios at once and finds the multi-party cycle." },
];

export function RoundView({ round }: { round: Round }) {
  const demo = useSearchParams().get("demo") === "1";
  const [mode, setMode] = useState<GraphMode>(demo ? "MARKET" : "VENUE0");
  const req = round.totals.requestedUsd;
  const crossed = mode === "MARKET" ? 0 : mode === "PAIRWISE" ? round.comparison.pairwise.crossedUsd : round.comparison.venue0.crossedUsd;
  const externalOrders = edgesFor(round, mode).filter((e) => e.kind === "external").length;
  const pairwise = round.comparison.pairwise.crossedUsd;
  const venue0 = round.comparison.venue0.crossedUsd;
  const uplift = venue0 - pairwise;
  const step = MODES.findIndex((m) => m.id === mode);
  const hasCycle = round.cycles.some((c) => c.length >= 3);
  const venue0Note = hasCycle
    ? "Venue0 looks across all portfolios at once and finds the multi-party cycle."
    : round.legs.length > 0
      ? "Venue0 crosses what complements, including partial matches, and computes the exact residual. This round needed only direct pairs."
      : "Venue0 found nothing complementary, so nothing crossed. Correct result.";
  const guideFor = (id: GraphMode) => (id === "VENUE0" ? venue0Note : MODES.find((m) => m.id === id)?.guide);

  return (
    <>
      {demo && (
        <div className="guide" role="region" aria-label="Guided demo">
          <div>
            <p style={{ color: "#fff", fontWeight: 500 }}>Step {step + 1} of 3 · {MODES[step]?.label}</p>
            <p>{guideFor(mode)}</p>
          </div>
          {step < 2 ? (
            <button type="button" className="btn btn-sm" onClick={() => setMode(MODES[step + 1]?.id ?? "VENUE0")}>Next: {MODES[step + 1]?.label.toLowerCase()}</button>
          ) : (
            <Link href={`/demo/round/${round.key}/execute?demo=1`} className="btn btn-sm">See the execution proof</Link>
          )}
        </div>
      )}

      <div className={styles.layout}>
        <section className={styles.stage} aria-label="Crossing graph">
          <div className={styles.stageHead}>
            <div className="segmented" role="group" aria-label="Compare matching approaches">
              {MODES.map((m) => (
                <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>
              ))}
            </div>
            <span className={styles.legend}>
              <span className={styles.legendCross} /> crossed between wallets
              <span className={styles.legendExt} /> sent to public liquidity
            </span>
          </div>
          <CrossingGraph round={round} mode={mode} caption={`${round.gate} under ${mode.toLowerCase()} matching`} />
          <p className={styles.modeNote}>{guideFor(mode)}</p>
        </section>

        <aside className={styles.panel} aria-label="Round result">
          <dl className="kv">
            <div><dt>Requested turnover</dt><dd>{usd(req)}</dd></div>
            <div><dt>Crossed{mode === "MARKET" ? "" : mode === "PAIRWISE" ? " (pairwise)" : ""}</dt><dd>{usd(crossed)}</dd></div>
            <div><dt>Residual</dt><dd>{usd(Math.max(0, req - crossed))}</dd></div>
            <div><dt>Cross rate</dt><dd>{req > 0 ? ratio(crossed / req) : "n/a"}</dd></div>
            <div><dt>External orders</dt><dd>{externalOrders}</dd></div>
          </dl>
          <div className={styles.compare}>
            <p className={styles.compareTitle}>This round, same intents</p>
            <div className={styles.compareRow}><span>Pairwise-only optimum</span><span className="num">{usd(pairwise)}</span></div>
            <div className={styles.compareRow}><span>Venue0</span><span className="num">{usd(venue0)}</span></div>
            <div className={styles.uplift}>
              <span>Multi-party uplift</span>
              <span className="num">{uplift > 0.005 ? `+${usd(uplift)}` : usd(0)}</span>
            </div>
            <p className={styles.compareNote}>
              {pairwise < 0.005 && venue0 > 0
                ? "No two wallets here are complements, so a pairwise matcher crosses nothing. Only the cycle works."
                : uplift <= 0.005
                  ? "Every match in this round is a direct pair; multi-party matching adds nothing here."
                  : `Multi-party matching crossed ${ratio(uplift / pairwise)} more than the pairwise optimum.`}
            </p>
          </div>
          <p className={styles.method}>Pairwise figure: {round.comparison.pairwise.method}. Cross rate reported by the matcher: {pct(round.totals.crossRateBps)}.</p>
        </aside>
      </div>
    </>
  );
}
