"use client";

import { useState } from "react";
import type { Round } from "@/lib/data";
import { usd } from "@/lib/format";
import { CrossingGraph } from "./crossing-graph";
import styles from "./how-it-works.module.css";

const STEPS = [
  { n: "01", title: "Target", body: "You say where your portfolio should be, in words or weights. Venue0 turns it into a signed intent with hard limits." },
  { n: "02", title: "Circle", body: "You join a Circle: people rebalancing the same Stock Tokens, crossing in scheduled rounds." },
  { n: "03", title: "Cross", body: "Each round, Venue0 finds the trades that cancel out, including cycles no two wallets could see, and settles them wallet to wallet in one transaction." },
  { n: "04", title: "Residual", body: "Whatever didn't cross is yours to decide: carry it into the next round, or trade it on public liquidity when the cost is worth it." },
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
        {active === 1 && (
          <div className={styles.intents}>
            <p className={styles.visualCaption}>A Circle, as its members see it</p>
            <div className={styles.intentRow}><span className={styles.who}>Stock Tokens</span>{[...new Set(round.participants.flatMap((p) => p.intent.map((l) => l.symbol)))].map((s) => <span key={s} className="badge badge-neutral">{s}</span>)}</div>
            <div className={styles.intentRow}><span className={styles.who}>Members</span><span className="muted">{round.participants.length} wallets, each signing its own rebalance</span></div>
            <div className={styles.intentRow}><span className={styles.who}>Rounds</span><span className="muted">Collect signed intents, freeze, solve, settle</span></div>
            <div className={styles.intentRow}><span className={styles.who}>Privacy</span><span className="muted">Members see their own legs; others appear as &quot;Member 2&quot;</span></div>
          </div>
        )}
        {active === 2 && <CrossingGraph round={round} mode="VENUE0" caption="The three-way cycle Venue0 settled" />}
        {active === 3 && (
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
