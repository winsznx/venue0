"use client";

import Link from "next/link";
import { useState } from "react";
import type { Round } from "@/lib/data";
import { short } from "@/lib/format";
import { CrossingGraph } from "./crossing-graph";
import styles from "./hero-cycle.module.css";

/** Replays the verified mainnet G2 round: intents appear, the cycle is discovered, then the result card. */
export function HeroCycle({ round }: { round: Round }) {
  const [run, setRun] = useState(0);
  const [found, setFound] = useState(false);
  const assets = new Set(round.legs.map((l) => l.symbol)).size;
  return (
    <div className={styles.stage}>
      <div className={styles.replayTag}>
        <span className="badge badge-neutral">Replay of verified mainnet round</span>
      </div>
      <CrossingGraph
        key={run}
        round={round}
        mode="VENUE0"
        caption="Three portfolios with complementary Stock Token changes; Venue0 finds a three-way cycle"
        onSequenceEnd={() => setFound(true)}
      />
      <div className={`${styles.result} ${found ? styles.resultShown : ""}`} aria-live="polite">
        {found && (
          <>
            <span className="status status-cross"><span className="status-dot" />CYCLE FOUND</span>
            <p className={styles.resultLine}>
              <span className="num">{round.participants.length}</span> portfolios
              <span className={styles.sep} />
              <span className="num">{assets}</span> Stock Tokens
              <span className={styles.sep} />
              <span className="num">1</span> atomic settlement
            </p>
            {round.settlement && (
              <a className="link num" href={round.settlement.explorer} target="_blank" rel="noreferrer">
                {short(round.settlement.txHash, 10, 6)} <span aria-hidden="true">↗</span>
                <span className="sr-only"> (opens settlement transaction on Blockscout)</span>
              </a>
            )}
          </>
        )}
      </div>
      <div className={styles.controls}>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setFound(false); setRun((n) => n + 1); }}>
          Replay
        </button>
        <Link href={`/demo/round/${round.key}`} className="btn btn-secondary btn-sm">Open this round</Link>
      </div>
    </div>
  );
}
