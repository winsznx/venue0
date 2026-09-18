"use client";

import { useState } from "react";
import type { Round } from "@/lib/data";
import { usd } from "@/lib/format";
import { CrossingGraph } from "./crossing-graph";
import styles from "./how-it-works.module.css";

const STEPS = [
  { n: "01", title: "Express target", body: "Each portfolio states where it wants to be. An agent turns that into a signed intent with hard limits." },
  { n: "02", title: "Cross complementary changes", body: "Venue0 looks across every intent in the round and settles the changes that cancel out, wallet to wallet, in one transaction." },
  { n: "03", title: "Route only the residual", body: "Whatever could not cross goes to public liquidity, and only when the route is economically sensible." },
];

export function HowItWorks({ round }: { round: Round }) {
  const [active, setActive] = useState(0);
  return (
    <div className={styles.panel}>
      <ol className={styles.steps}>
        {STEPS.map((s, i) => (
          <li key={s.n}>
            <button type="button" className={`${styles.step} ${active === i ? styles.active : ""}`} onClick={() => setActive(i)} aria-pressed={active === i}>
              <span className={`${styles.n} num`}>{s.n}</span>
              <span>
                <span className={styles.title}>{s.title}</span>
                <span className={styles.body}>{s.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className={styles.visual} aria-live="polite">
        {active === 0 && (
          <div className={styles.intents}>
            <p className={styles.visualCaption}>Signed intents from the verified mainnet round</p>
            {round.participants.map((p) => (
              <div key={p.address} className={styles.intentRow}>
                <span className={styles.who}>{p.label}</span>
                {p.intent.map((l) => (
                  <span key={l.symbol + l.side} className={`badge ${l.side === "SELL" ? "badge-neutral" : "badge-cross"}`}>
                    {l.side === "SELL" ? "sell" : "buy"} {l.symbol} <span className="num">{usd(l.valueUsd)}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
        {active === 1 && <CrossingGraph round={round} mode="VENUE0" caption="The three-way cycle Venue0 settled" />}
        {active === 2 && (
          <div className={styles.compare}>
            <p className={styles.visualCaption}>Same round, external orders needed</p>
            <div className={styles.compareRow}>
              <span>Every wallet on its own</span>
              <span className="num">{round.comparison.marketOnly.externalOrders}</span>
            </div>
            <div className={styles.bar}><span style={{ width: "100%" }} className={styles.barMarket} /></div>
            <div className={styles.compareRow}>
              <span>Venue0</span>
              <span className="num">{round.comparison.venue0.externalOrders}</span>
            </div>
            <div className={styles.bar}><span style={{ width: `${(round.comparison.venue0.externalOrders / round.comparison.marketOnly.externalOrders) * 100}%` }} className={styles.barVenue} /></div>
            <p className={styles.footnote}>
              {usd(round.totals.dustUsd)} of rounding dust stayed with the wallets instead of becoming orders.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
