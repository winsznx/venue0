"use client";

import { useState, useTransition } from "react";
import { api } from "@/lib/json";
import { usd } from "@/lib/format";
import type { TargetCheck } from "@/lib/server/targets";
import type { SavedTarget } from "@/lib/server/users";
import type { Position } from "@/lib/server/portfolio";
import styles from "./product.module.css";
import pstyles from "../portfolio.module.css";

type Mode = "STRUCTURED" | "NATURAL_LANGUAGE";
type Row = { symbol: string; pct: string };
type Draft = Omit<SavedTarget, "updatedAt">;

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

/**
 * Where the user wants their portfolio to be. Both modes end in the same deterministic check against live balances and
 * Chainlink prices; only a checked target can be saved.
 */
export function TargetEditor({ positions, totalUsd, saved, agentAvailable, defaultMode, onSaved }: { positions: Position[]; totalUsd: number; saved: SavedTarget | null; agentAvailable: boolean; defaultMode: Mode; onSaved?: () => void }) {
  const [mode, setMode] = useState<Mode>(agentAvailable ? defaultMode : "STRUCTURED");
  const [instruction, setInstruction] = useState(saved?.instruction ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    saved ? saved.weights.map((w) => ({ symbol: w.symbol, pct: (w.weightBps / 100).toFixed(1) })) : positions.map((p) => ({ symbol: p.symbol, pct: totalUsd > 0 ? ((p.valueUsd / totalUsd) * 100).toFixed(1) : "0" })),
  );
  const [cash, setCash] = useState(saved && saved.cashBps > 0 ? (saved.cashBps / 100).toFixed(1) : "");
  const [maxBps, setMaxBps] = useState(String(saved?.maxExternalCostBps ?? 50));
  const [style, setStyle] = useState<SavedTarget["residualStyle"]>(saved?.residualStyle ?? "ANY");
  const [check, setCheck] = useState<TargetCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sum = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0) + (Number(cash) || 0);
  const draft = (): Draft => ({
    weights: rows.filter((r) => r.symbol.trim()).map((r) => ({ uid: "", symbol: r.symbol.trim().toUpperCase(), weightBps: Math.round((Number(r.pct) || 0) * 100) })),
    cashBps: Math.round((Number(cash) || 0) * 100),
    source: mode,
    instruction: mode === "NATURAL_LANGUAGE" ? instruction : null,
    maxExternalCostBps: Number(maxBps) || 50,
    residualStyle: style,
  });

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  const preview = () =>
    run(async () => {
      setSavedAt(null);
      setCheck(mode === "NATURAL_LANGUAGE" ? await api<TargetCheck>("/api/me/target/preview", { body: { mode, instruction } }) : await api<TargetCheck>("/api/me/target/preview", { body: { mode, target: draft() } }));
    });

  const save = () =>
    run(async () => {
      if (!check?.ok) return;
      const target: Draft = { ...draft(), weights: check.weights, cashBps: 10_000 - check.weights.reduce((sum, w) => sum + w.weightBps, 0), source: check.source };
      const res = await api<{ ok: boolean; problems?: Array<{ detail: string }> }>("/api/me/target", { body: target });
      if (!res.ok) throw new Error(res.problems?.map((p) => p.detail).join(" ") ?? "Target was rejected.");
      setSavedAt(new Date().toLocaleTimeString());
      onSaved?.();
    });

  return (
    <div className={styles.stack}>
      <div className="segmented" role="group" aria-label="Target mode">
        <button type="button" aria-pressed={mode === "NATURAL_LANGUAGE"} onClick={() => { setMode("NATURAL_LANGUAGE"); setCheck(null); }}>Describe it</button>
        <button type="button" aria-pressed={mode === "STRUCTURED"} onClick={() => { setMode("STRUCTURED"); setCheck(null); }}>Set weights</button>
      </div>

      {mode === "NATURAL_LANGUAGE" ? (
        <div className={pstyles.agentBox}>
          {!agentAvailable && <p className={styles.note}>The language agent is not configured on this server, so nothing is sent to a model. Use Set weights; the same checks apply.</p>}
          <label htmlFor="instruction" className="sr-only">Describe your target portfolio</label>
          <textarea id="instruction" className={pstyles.textarea} rows={3} disabled={!agentAvailable} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Reduce NVDA to 20% and move the difference into SPY. Don't pay more than 0.5% to trade what's left." />
          <p className="faint" style={{ fontSize: 14 }}>The model only reads your words into operations. Tickers, prices and amounts are resolved by code against your live wallet.</p>
        </div>
      ) : (
        <div className={pstyles.structured}>
          <div className={pstyles.rows}>
            {rows.map((r, i) => (
              <div key={i} className={pstyles.row}>
                <label className="sr-only" htmlFor={`sym-${i}`}>Ticker</label>
                <input id={`sym-${i}`} className={pstyles.input} value={r.symbol} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, symbol: e.target.value } : x)))} placeholder="Ticker" />
                <label className="sr-only" htmlFor={`pct-${i}`}>Target percent for {r.symbol}</label>
                <input id={`pct-${i}`} className={`${pstyles.input} num`} inputMode="decimal" value={r.pct} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} />
                <span className="faint">%</span>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.symbol || "row"}`}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn btn-quiet btn-sm" style={{ justifySelf: "start" }} onClick={() => setRows([...rows, { symbol: "", pct: "0" }])}>Add a Stock Token</button>
          </div>
          <div className={pstyles.constraints}>
            <label>Keep in cash <span><input className={`${pstyles.input} num`} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" /> %</span></label>
            <label>Most you'll pay to trade leftovers <span><input className={`${pstyles.input} num`} inputMode="numeric" value={maxBps} onChange={(e) => setMaxBps(e.target.value)} /> bps</span></label>
            <label>Leftover handling
              <select className={pstyles.input} value={style} onChange={(e) => setStyle(e.target.value as SavedTarget["residualStyle"])}>
                <option value="ANY">Cheapest valid route</option><option value="LIMIT">Limit orders only</option><option value="TWAP">Spread over 2 hours</option><option value="WAIT">Wait for the next round</option>
              </select>
            </label>
          </div>
          <p className={`num ${sum > 100.05 ? pstyles.neg : "faint"}`} style={{ fontSize: 14 }}>Total {sum.toFixed(1)}%</p>
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className="btn btn-secondary" disabled={pending || (mode === "NATURAL_LANGUAGE" && !agentAvailable)} onClick={preview}>{pending && !check ? "Checking…" : "Check this target"}</button>
        {check?.ok && <button type="button" className="btn btn-primary" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save target"}</button>}
        {savedAt && <span className="badge badge-verified">Saved {savedAt}</span>}
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {check && (
        <div aria-live="polite" className={styles.stack}>
          {check.ok ? (
            <>
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">Current and target allocation</caption>
                  <thead><tr><th>Asset</th><th className="r">Now</th><th className="r">Target</th><th className="r">Change</th></tr></thead>
                  <tbody>
                    {check.rows.map((r) => (
                      <tr key={r.uid}>
                        <td><span className={pstyles.asset}>{r.symbol}</span></td>
                        <td className="r num">{r.currentPct.toFixed(1)}%</td>
                        <td className="r num">{r.targetPct.toFixed(1)}%</td>
                        <td className={`r num ${r.deltaUsd < 0 ? pstyles.neg : r.deltaUsd > 0 ? pstyles.pos : ""}`}>{r.deltaUsd === 0 ? "none" : `${r.deltaUsd > 0 ? "buy" : "sell"} ${usd(Math.abs(r.deltaUsd))}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {check.cashTargetUsd > 0 && <p className="muted">Cash target {usd(check.cashTargetUsd)}. Cash can't cross between wallets yet, so that part always goes to a market.</p>}
              {check.warnings.map((w) => <p key={w} className="muted">{w}</p>)}
              <p className="faint" style={{ fontSize: 14 }}>Checked {check.computedAt.slice(11, 19)} UTC against your live balances and Chainlink prices.</p>
            </>
          ) : (
            <ul className={pstyles.problems}>
              {check.problems.map((p, i) => <li key={i}><span className="badge badge-warn">{PROBLEM_WORDS[p.code] ?? p.code}</span> {p.detail}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
