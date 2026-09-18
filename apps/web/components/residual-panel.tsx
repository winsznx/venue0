import type { Round } from "@/lib/data";
import { proof } from "@/lib/data";
import { residualOutcome } from "@/lib/residual-outcome";
import { short, txUrl, usd } from "@/lib/format";
import styles from "@/app/(public)/demo/round/[id]/round-pages.module.css";

const DECISION_WORDS: Record<string, string> = { EXECUTE_NOW: "Execute now", LIMIT: "Limit order", TWAP: "TWAP", WAIT: "Wait", CANCEL: "Cancel", AGGREGATE: "Aggregate into next round" };

/** Residual outcome for a round, from evidence only. The economic engine's route table appears where it actually ran. */
export function ResidualPanel({ round }: { round: Round }) {
  const outcome = residualOutcome(round);
  const external = round.fills.filter((f) => f.residualClass === "EXTERNAL");
  return (
    <section className={styles.sheet} aria-labelledby="residual-title">
      <h2 id="residual-title" className="h3">Residual</h2>
      {external.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead><tr><th>Owner</th><th>Asset</th><th>Side</th><th className="r">Amount</th><th className="r">Notional</th><th>Urgency</th></tr></thead>
            <tbody>
              {external.map((f) => {
                const p = round.participants.find((x) => x.address === f.owner);
                return (
                  <tr key={f.owner + f.symbol}>
                    <td>{p?.label}</td><td>{f.symbol}</td><td>{f.side === "SELL" ? "Sell" : "Buy"}</td>
                    <td className="r num">{f.residualTokens.toPrecision(4)}</td><td className="r num">{usd(f.residualUsd)}</td>
                    <td>{String((p?.policy as { urgency?: string } | undefined)?.urgency ?? "").toLowerCase()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {outcome.kind === "DUST_ONLY" && <p className="muted" style={{ marginTop: 12 }}>No external residual. {usd(outcome.dustUsd)} of rounding dust stayed in the wallets; no venue would execute it.</p>}
      {outcome.kind === "NO_RESIDUAL" && <p className="muted" style={{ marginTop: 12 }}>Everything crossed. Nothing went to an external venue.</p>}
      {outcome.kind === "NOT_EXECUTED" && (
        <p className="muted" style={{ marginTop: 12 }}>
          {usd(outcome.externalUsd)} across {outcome.count} residual orders was not executed in this proof run. It stayed in the wallets; no external order was placed.
        </p>
      )}
      {outcome.kind === "UNISWAP_EXECUTED" && (
        <div className={styles.routes}>
          <div className={`${styles.route} ${styles.routeChosen}`}>
            <span className={styles.routeName}>Uniswap · executed</span>
            <span className="badge badge-verified">Verified readback</span>
            <span className={styles.routeMeta}>{outcome.detail}. <a className="link num" href={outcome.explorer} target="_blank" rel="noreferrer">{short(outcome.txHash, 10, 6)} ↗</a></span>
          </div>
          <p className="faint" style={{ fontSize: 14 }}>Executed before the economic engine existed; the swap delivered exactly the quoted output.</p>
        </div>
      )}
      {outcome.kind === "FLASH_BOUNDARY" && (
        <>
          <div className={styles.routes}>
            {proof.residualDecisionReplay.decision.evaluated.map((r) => (
              <div key={r.venue + r.style} className={styles.route}>
                <span className={styles.routeName}>{r.venue === "FLASH" ? "Flash" : "Uniswap"} {r.style.toLowerCase()}</span>
                <span className={`badge ${r.viable ? "badge-verified" : r.allowed ? "badge-warn" : "badge-neutral"}`}>{r.viable ? "viable" : r.allowed ? "too expensive" : "not allowed"}</span>
                <span className={styles.routeMeta}>
                  all-in <span className="num">{(r.allInCostBps / 100).toFixed(2)}%</span> ({usd(r.allInCostUsd, 4)})
                  {r.providerFeeUsd !== null && <> · provider fee <span className="num">{usd(r.providerFeeUsd, 4)}</span></>}
                  {r.networkCostUsd !== null && <> · network <span className="num">{usd(r.networkCostUsd, 4)}</span></>}
                  {" "}· fixed part <span className="num">{usd(r.fixedCostUsd, 4)}</span> · {r.note}
                </span>
              </div>
            ))}
            {["WAIT", "AGGREGATE"].map((d) => (
              <div key={d} className={`${styles.route} ${proof.residualDecisionReplay.decision.decision === d ? styles.routeChosen : ""}`}>
                <span className={styles.routeName}>{DECISION_WORDS[d]}</span>
                {proof.residualDecisionReplay.decision.decision === d && <span className="badge badge-cross">Venue0 decision</span>}
              </div>
            ))}
          </div>
          <p style={{ marginTop: 14 }}><strong>Venue0 decision: {DECISION_WORDS[outcome.replayDecision] ?? outcome.replayDecision}.</strong> <span className="muted">{proof.residualDecisionReplay.decision.reasons.join("; ")}.</span></p>
          <p className="faint" style={{ fontSize: 14, marginTop: 6 }}>Live re-evaluation on {proof.residualDecisionReplay.at.slice(0, 16).replace("T", " ")} UTC with fresh Uniswap and Flash quotes. No order placed.</p>
          <div className="tile" style={{ padding: 18, marginTop: 16, display: "grid", gap: 6 }}>
            <span className="badge badge-warn" style={{ justifySelf: "start" }}>Boundary case</span>
            <p>Before the economics engine, this residual was sent to a Flash limit order. Flash was operationally available and filled it, but its fixed fee was <span className="num">{(outcome.feeBps / 100).toFixed(1)}%</span> of the {usd(outcome.notionalUsd)} residual. The improved engine aggregates instead of repeating it.</p>
            <p className="muted" style={{ fontSize: 14 }}>Order <span className="num">{short(outcome.orderId, 8, 4)}</span> · fill <a className="link num" href={txUrl(outcome.fillTx)} target="_blank" rel="noreferrer">{short(outcome.fillTx, 10, 6)} ↗</a></p>
          </div>
        </>
      )}
    </section>
  );
}
