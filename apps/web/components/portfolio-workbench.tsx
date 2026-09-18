"use client";

import { useMemo, useState, useTransition } from "react";
import type { GoalSpec } from "@venue0/agent";
import { interpretInstruction, previewStructured, type PreviewResult } from "@/lib/server/agent-actions";
import type { Position } from "@/lib/server/portfolio";
import { usd } from "@/lib/format";
import styles from "./portfolio.module.css";

const PROBLEM_WORDS: Record<string, string> = {
  CLARIFICATION_NEEDED: "Needs clarification",
  AMBIGUOUS_TICKER: "Ambiguous ticker",
  UNSUPPORTED_TOKEN: "Not a Stock Token",
  WEIGHTS_EXCEED_100: "Weights exceed 100%",
  IMPOSSIBLE_ALLOCATION: "Impossible allocation",
  CONFLICTING_CONSTRAINTS: "Conflicting constraints",
  NOT_HELD: "Not held",
  NO_SAVED_TARGET: "No saved target",
  INVALID_OPERATION: "Invalid request",
  STALE_METADATA: "Stale asset data",
  PENDING_CORPORATE_ACTION: "Corporate action pending",
  NO_CHANGE: "Nothing to change",
};

type Row = { symbol: string; pct: string };

export function PortfolioWorkbench({ address, positions, totalUsd, agentAvailable }: { address: string; positions: Position[]; totalUsd: number; agentAvailable: boolean }) {
  const [instruction, setInstruction] = useState("");
  const [rows, setRows] = useState<Row[]>(() => positions.map((p) => ({ symbol: p.symbol, pct: totalUsd > 0 ? ((p.valueUsd / totalUsd) * 100).toFixed(1) : "0" })));
  const [cash, setCash] = useState("");
  const [maxBps, setMaxBps] = useState("50");
  const [style, setStyle] = useState<"ANY" | "LIMIT" | "TWAP" | "WAIT">("ANY");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [pending, start] = useTransition();

  const targetBySymbol = useMemo(() => new Map(result?.ok ? result.rows.map((r) => [r.symbol, r]) : []), [result]);
  const sum = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0) + (Number(cash) || 0);

  const structuredSpec = (): GoalSpec => ({
    operations: rows.filter((r) => r.symbol.trim()).map((r) => ({ op: "SET_WEIGHT", symbol: r.symbol.trim().toUpperCase(), weightPct: Number(r.pct), from: null, to: null, fraction: null })),
    remainderTo: null,
    cashWeightPct: cash ? Number(cash) : null,
    constraints: { maxExternalSlippageBps: Number(maxBps), allowMarketResidual: style === "ANY" ? null : false, residualStyle: style === "ANY" ? null : style, twapDurationSec: style === "TWAP" ? 7_200 : null, urgency: null, crossAsMuchAsPossible: true },
    circleName: null,
    roundTiming: null,
    clarificationsNeeded: [],
  });

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Holdings with current and target allocation</caption>
          <thead>
            <tr><th>Asset</th><th className="r">Current value</th><th className="r">Current %</th><th className="r">Target %</th><th className="r">Delta</th></tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const t = targetBySymbol.get(p.symbol);
              return (
                <tr key={p.uid}>
                  <td><span className={styles.asset}>{p.symbol}</span> <span className="faint" style={{ fontSize: 13 }}>{p.name.replace(" • Robinhood Token", "")}</span>{p.stale && <span className="badge badge-warn" style={{ marginLeft: 8 }}>price stale</span>}</td>
                  <td className="r num">{usd(p.valueUsd)}</td>
                  <td className="r num">{totalUsd > 0 ? `${((p.valueUsd / totalUsd) * 100).toFixed(1)}%` : "—"}</td>
                  <td className="r num">{t && result?.ok ? `${((t.targetUsd / result.totalUsd) * 100).toFixed(1)}%` : "—"}</td>
                  <td className={`r num ${t ? (t.deltaUsd < 0 ? styles.neg : styles.pos) : ""}`}>{t ? `${t.deltaUsd >= 0 ? "+" : "−"}${usd(Math.abs(t.deltaUsd))}` : "—"}</td>
                </tr>
              );
            })}
            {result?.ok && result.rows.filter((r) => !positions.some((p) => p.symbol === r.symbol)).map((r) => (
              <tr key={r.symbol}>
                <td><span className={styles.asset}>{r.symbol}</span> <span className="faint" style={{ fontSize: 13 }}>new position</span></td>
                <td className="r num">{usd(0)}</td><td className="r num">0.0%</td>
                <td className="r num">{((r.targetUsd / result.totalUsd) * 100).toFixed(1)}%</td>
                <td className={`r num ${styles.pos}`}>+{usd(r.deltaUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className={styles.target} aria-labelledby="target-title">
        <h2 id="target-title" className="h3">Where do you want to go?</h2>

        <div className={styles.agentBox}>
          <div className={styles.agentHead}>
            <span className={`status ${agentAvailable ? "status-live" : "status-neutral"}`}><span className="status-dot" />{agentAvailable ? "LIVE AGENT" : "LIVE AGENT UNAVAILABLE"}</span>
            {!agentAvailable && <span className="faint" style={{ fontSize: 14 }}>No Anthropic credential is configured, so nothing is sent to a model. Use structured target mode below.</span>}
          </div>
          <label htmlFor="instruction" className="sr-only">Describe your target portfolio</label>
          <textarea id="instruction" className={styles.textarea} rows={3} disabled={!agentAvailable} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Reduce NVDA to 20%, move the difference into SPY, and don't use an external market if execution gets expensive." />
          <button type="button" className="btn btn-primary btn-sm" disabled={!agentAvailable || pending} onClick={() => start(async () => setResult(await interpretInstruction(address, instruction)))}>Interpret</button>
        </div>

        <div className={styles.structured}>
          <div className={styles.agentHead}><span className="status status-cross"><span className="status-dot" />STRUCTURED TARGET MODE</span><span className="faint" style={{ fontSize: 14 }}>Set target weights directly. The same deterministic checks apply.</span></div>
          <div className={styles.rows}>
            {rows.map((r, i) => (
              <div key={i} className={styles.row}>
                <label className="sr-only" htmlFor={`sym-${i}`}>Ticker</label>
                <input id={`sym-${i}`} className={styles.input} value={r.symbol} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, symbol: e.target.value } : x)))} placeholder="Ticker" />
                <label className="sr-only" htmlFor={`pct-${i}`}>Target percent for {r.symbol}</label>
                <input id={`pct-${i}`} className={`${styles.input} num`} inputMode="decimal" value={r.pct} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} />
                <span className="faint">%</span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.symbol}`}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn btn-quiet btn-sm" style={{ justifySelf: "start" }} onClick={() => setRows([...rows, { symbol: "", pct: "0" }])}>Add a Stock Token</button>
          </div>
          <div className={styles.constraints}>
            <label>Keep in cash (USDG) <span><input className={`${styles.input} num`} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" /> %</span></label>
            <label>Max external cost <span><input className={`${styles.input} num`} inputMode="numeric" value={maxBps} onChange={(e) => setMaxBps(e.target.value)} /> bps</span></label>
            <label>Residual handling
              <select className={styles.input} value={style} onChange={(e) => setStyle(e.target.value as typeof style)}>
                <option value="ANY">Cheapest valid route</option><option value="LIMIT">Limit orders only</option><option value="TWAP">TWAP over 2 hours</option><option value="WAIT">Wait, no market orders</option>
              </select>
            </label>
          </div>
          <div className={styles.submit}>
            <span className={`num ${sum > 100.05 ? styles.neg : "faint"}`}>Total {sum.toFixed(1)}%</span>
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(async () => setResult(await previewStructured(address, structuredSpec())))}>{pending ? "Checking" : "Check this target"}</button>
          </div>
        </div>

        {result && (
          <div className={styles.result} aria-live="polite">
            {result.source === "MODEL" && result.spec && (
              <div className={styles.interp}>
                <span className="status status-cross"><span className="status-dot" />AGENT INTERPRETATION</span>
                <pre className="num">{JSON.stringify({ operations: result.spec.operations, remainderTo: result.spec.remainderTo, cashWeightPct: result.spec.cashWeightPct, constraints: result.spec.constraints, clarificationsNeeded: result.spec.clarificationsNeeded }, null, 2)}</pre>
                <p className="faint" style={{ fontSize: 13 }}>Untrusted model output. Addresses, prices and amounts below come from code, not the model.</p>
              </div>
            )}
            <span className="status status-neutral"><span className="status-dot" />DETERMINISTIC CHECK</span>
            {result.ok ? (
              <>
                <p><span className="badge badge-verified">Valid target</span> <span className="muted">Computed {result.computedAt.slice(11, 19)} UTC against live holdings and Chainlink prices.</span></p>
                <ul className={styles.limits}>
                  {result.limits.map((l) => <li key={l.symbol + l.side}><span className={`badge ${l.side === "SELL" ? "badge-neutral" : "badge-cross"}`}>{l.side === "SELL" ? "Sell up to" : "Buy up to"}</span> <span className="num">{l.amountTokens.toPrecision(5)}</span> {l.symbol}</li>)}
                </ul>
                {result.cashTargetUsd > 0 && <p className="muted">Cash target {usd(result.cashTargetUsd)}.</p>}
                {result.warnings.map((w) => <p key={w} className="muted">{w}</p>)}
                <p className="muted">Max external cost {result.policy.maxExternalSlippageBps} bps · residuals: {[result.policy.allowMarketResidual && "market", result.policy.allowLimitResidual && "limit", result.policy.allowTwapResidual && "TWAP", result.policy.allowWaitResidual && "wait"].filter(Boolean).join(", ")}</p>
                <a href="/circles" className="btn btn-secondary btn-sm" style={{ justifySelf: "start" }}>Take this target to a circle round</a>
              </>
            ) : (
              <ul className={styles.problems}>
                {result.problems.map((p, i) => <li key={i}><span className="badge badge-warn">{PROBLEM_WORDS[p.code] ?? p.code}</span> {p.detail}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>
    </>
  );
}
