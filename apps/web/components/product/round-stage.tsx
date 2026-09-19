"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { erc20Abi, encodeFunctionData, type Hex, type TypedDataDefinition } from "viem";
import { CrossingGraph } from "@/components/crossing-graph";
import { useSigner, walletErrorMessage } from "@/components/wallet/use-signer";
import { RESIDUAL_WORDS, STATE_WORDS } from "@/lib/activity-words";
import { api } from "@/lib/json";
import { addressUrl, blockUrl, short, tokens, txLogsUrl, txUrl, usd } from "@/lib/format";
import type { RoundViewData } from "@/lib/server/round-view";
import rp from "@/app/(public)/demo/round/[id]/round-pages.module.css";
import p from "./product.module.css";

export type StageView = "lobby" | "match" | "proposal" | "execute" | "receipt";

const COLLECTING = new Set(["OPEN", "COLLECTING"]);
const SOLVING = new Set(["FROZEN", "SOLVING"]);
const PROPOSAL = new Set(["PROPOSED", "APPROVING", "READY_TO_SETTLE"]);
const SETTLING = new Set(["SETTLING", "SETTLED", "VERIFYING"]);

function useRound(roundId: string) {
  const [data, setData] = useState<RoundViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setData(await api<RoundViewData>(`/api/rounds/${roundId}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [roundId]);
  const settled = data ? data.round.terminal && (data.round.state !== "COMPLETE" || data.you.decisions.length > 0 || data.you.residual.every((r) => r.dust)) : false;
  useEffect(() => {
    void refresh();
    if (settled) return;
    const id = window.setInterval(() => void refresh(), 4_000);
    return () => window.clearInterval(id);
  }, [refresh, settled]);
  return { data, error, refresh };
}

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const run = (fn: (say: (s: string) => void) => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn(setStatus);
        setStatus(null);
      } catch (e) {
        setStatus(null);
        setError(walletErrorMessage(e));
      }
    });
  return { pending, error, status, run };
}

export function RoundStage({ roundId, view }: { roundId: string; view: StageView }) {
  const { data, error, refresh } = useRound(roundId);
  if (error && !data) return <p className={p.error} role="alert">{error}</p>;
  if (!data) return <p className="muted">Loading round…</p>;
  const s = data.round.state;
  const reached = {
    lobby: true,
    match: !COLLECTING.has(s) && !SOLVING.has(s),
    proposal: Boolean(data.round.planHash) && data.you.inPlan,
    execute: Boolean(data.round.planHash) && data.you.inPlan,
    receipt: data.you.signed && (s === "COMPLETE" || s === "NO_CROSS" || s === "VERIFICATION_FAILED" || s === "SETTLEMENT_REVERTED"),
  };
  const tabs: Array<{ key: StageView; label: string; href: string }> = [
    { key: "lobby", label: "Lobby", href: `/round/${roundId}/lobby` },
    { key: "match", label: "Match", href: `/round/${roundId}` },
    { key: "proposal", label: "Proposal", href: `/round/${roundId}/proposal` },
    { key: "execute", label: "Execution", href: `/round/${roundId}/execute` },
    { key: "receipt", label: "Receipt", href: `/round/${roundId}/receipt` },
  ];
  return (
    <>
      <header className="page-head">
        <div>
          <p className="muted"><Link className="link" href={`/circles/${data.circle.id}`}>{data.circle.name}</Link> · Round {data.round.sequence}</p>
          <h1 style={{ marginTop: 6 }}>{HEADLINE[view](data)}</h1>
        </div>
        <span className={`badge ${s === "COMPLETE" ? "badge-verified" : data.round.terminal ? "badge-neutral" : "badge-cross"}`}>{STATE_WORDS[s] ?? s}</span>
      </header>
      <nav className="tabs" aria-label="Round stages" style={{ marginBottom: 24, flexWrap: "wrap" }}>
        {tabs.map((t) => reached[t.key] ? (
          <Link key={t.key} href={t.href} className={`tab ${t.key === view ? "tab-active" : ""}`} aria-current={t.key === view ? "page" : undefined}>{t.label}</Link>
        ) : (
          <span key={t.key} className="tab tab-disabled" aria-disabled="true">{t.label}</span>
        ))}
      </nav>
      {error && <p className={p.note}>Connection hiccup, retrying: {error}</p>}
      {view === "lobby" && <Lobby d={data} refresh={refresh} />}
      {view === "match" && <Match d={data} refresh={refresh} />}
      {view === "proposal" && <Proposal d={data} refresh={refresh} />}
      {view === "execute" && <Execute d={data} refresh={refresh} />}
      {view === "receipt" && <Receipt d={data} />}
    </>
  );
}

const HEADLINE: Record<StageView, (d: RoundViewData) => string> = {
  lobby: (d) => (COLLECTING.has(d.round.state) ? "Round lobby" : SOLVING.has(d.round.state) ? "Solving the round" : "Collection closed"),
  match: (d) => (d.round.state === "NO_CROSS" ? "No cross this round" : d.you.inPlan ? "Match found" : d.you.signed ? "Round result" : "Round result"),
  proposal: () => "Your settlement plan",
  execute: () => "Execution",
  receipt: () => "Receipt",
};

type Props = { d: RoundViewData; refresh: () => Promise<void> };

function useCountdown(until: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, until - now);
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

type Prepared = { intent: unknown; typedData: TypedDataDefinition; rows: Array<{ symbol: string; side: "SELL" | "BUY"; amountTokens: number; valueUsd: number }>; outsideCircle: string[]; warnings: string[] };

function Lobby({ d, refresh }: Props) {
  const { signTypedData } = useSigner();
  const act = useAction();
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const left = useCountdown(d.round.freezesAt);
  const collecting = COLLECTING.has(d.round.state);

  useEffect(() => {
    if (!collecting || d.you.signed) return;
    api<Prepared>(`/api/rounds/${d.round.id}/intent`).then(setPrepared, (e: Error) => setPrepError(e.message));
  }, [collecting, d.you.signed, d.round.id]);

  const sign = () =>
    act.run(async (say) => {
      if (!prepared) return;
      say("Waiting for your wallet signature…");
      const signature = await signTypedData(prepared.typedData);
      say("Submitting your signed intent…");
      await api(`/api/rounds/${d.round.id}/intent`, { body: { intent: prepared.intent, signature } });
      await refresh();
    });

  const rows = d.you.signed ? d.you.intent : prepared?.rows ?? [];
  return (
    <div className={p.split}>
      <div className={p.stack}>
        <ol className={p.steps} aria-label="Round progress">
          <li className={`${p.step} ${collecting ? p.stepOn : p.stepDone}`}>Collecting</li>
          <li className={`${p.step} ${SOLVING.has(d.round.state) ? p.stepOn : collecting ? "" : p.stepDone}`}>Solving</li>
          <li className={`${p.step} ${!collecting && !SOLVING.has(d.round.state) ? p.stepOn : ""}`}>Match found</li>
        </ol>

        <section className={p.panel} aria-labelledby="intent-title">
          <div className={p.panelHead}><h2 id="intent-title">Your rebalance for this round</h2>{d.you.signed && <span className="badge badge-verified">Signed</span>}</div>
          {collecting && !d.you.signed && prepError && (
            <div className={p.empty}>
              <h3>You can't sign into this round yet</h3>
              <p className="muted">{prepError}</p>
              <Link href="/portfolio" className="btn btn-secondary btn-sm">Review my target</Link>
            </div>
          )}
          {collecting && !d.you.signed && !prepared && !prepError && <p className="muted">Working out your trade from your target and the round's prices…</p>}
          {rows.length > 0 && (
            <ul className={p.list}>
              {rows.map((r) => (
                <li key={r.symbol + r.side} className={p.listRow} style={{ background: "var(--surface)" }}>
                  <span><span className={`badge ${r.side === "SELL" ? "badge-neutral" : "badge-cross"}`}>{r.side === "SELL" ? "Sell up to" : "Buy up to"}</span> <span className="num">{tokens(r.amountTokens)}</span> {r.symbol}</span>
                  <span className="num muted">{usd(r.valueUsd)}</span>
                </li>
              ))}
            </ul>
          )}
          {prepared?.outsideCircle.length ? <p className="faint" style={{ fontSize: 14 }}>Not in this Circle, so not in this round: {prepared.outsideCircle.join(", ")}.</p> : null}
          {collecting && !d.you.signed && prepared && (
            <>
              <p className="muted">Signing commits you to trade at most these amounts at this round's snapshot prices. Nothing moves until you approve a specific settlement plan later.</p>
              <div className={p.actions}><button type="button" className="btn btn-primary" disabled={act.pending} onClick={sign}>{act.pending ? act.status ?? "Working…" : "Sign and join round"}</button></div>
            </>
          )}
          {!collecting && !d.you.signed && <p className="muted">You didn't sign into this round.</p>}
          {act.error && <p className={p.error} role="alert">{act.error}</p>}
        </section>
      </div>

      <div className={p.stack}>
        <section className={p.soft} aria-labelledby="round-title">
          <div className={p.panelHead}><h2 id="round-title">This round</h2></div>
          <dl className="kv">
            {collecting && <div><dt>Collection closes in</dt><dd>{left}</dd></div>}
            <div><dt>Signed in</dt><dd>{d.aggregate.signed} of {d.circle.memberCount} members</dd></div>
            <div><dt>Needed to cross</dt><dd>{d.circle.minParticipants}</dd></div>
            <div><dt>Prices</dt><dd>{d.round.prices.map((x) => `${x.symbol} ${usd(x.priceUsd)}`).join(" · ")}</dd></div>
          </dl>
          {collecting && d.circle.isOrganizer && <OrganizerClose d={d} refresh={refresh} />}
        </section>
        <Outcome d={d} />
      </div>
    </div>
  );
}

function OrganizerClose({ d, refresh }: Props) {
  const act = useAction();
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" disabled={act.pending || d.aggregate.signed === 0} onClick={() => act.run(async () => { await api(`/api/rounds/${d.round.id}/close`, { method: "POST" }); await refresh(); })}>Close collection now</button>
      {act.error && <p className={p.error} role="alert">{act.error}</p>}
    </>
  );
}

function Outcome({ d }: { d: RoundViewData }) {
  const s = d.round.state;
  if (COLLECTING.has(s)) return null;
  if (SOLVING.has(s)) return <p className="muted">Collection closed. Venue0 is searching every signed rebalance for trades that cancel out…</p>;
  if (s === "EXPIRED") return <div className={p.empty}><h3>This round expired</h3><p className="muted">Nobody signed before collection closed. Enter the lobby from the Circle to open a new round.</p><Link className="btn btn-secondary btn-sm" href={`/circles/${d.circle.id}`}>Back to Circle</Link></div>;
  if (s === "INSUFFICIENT_PARTICIPANTS") return <div className={p.empty}><h3>Not enough people this round</h3><p className="muted">{d.aggregate.signed} signed; this Circle needs {d.circle.minParticipants}. No trade happened and nothing left your wallet.</p><Link className="btn btn-secondary btn-sm" href={`/circles/${d.circle.id}`}>Back to Circle</Link></div>;
  if (s === "PLAN_STALE") return <div className={p.empty}><h3>The plan expired</h3><p className="muted">{d.round.history.at(-1)?.reason ?? "Prices or the approval window moved on."} No tokens moved.</p><Link className="btn btn-secondary btn-sm" href={`/circles/${d.circle.id}`}>Back to Circle</Link></div>;
  return (
    <section className={p.youCard}>
      <h2 className="h3">{s === "NO_CROSS" ? "No cross this round" : "Match found"}</h2>
      <p>{s === "NO_CROSS" ? "Nobody in this round needed the opposite of your trade." : `${usd(d.aggregate.crossedUsd)} crossed wallet to wallet across ${d.aggregate.legCount} legs.`}</p>
      <Link href={`/round/${d.round.id}`} className="btn" style={{ background: "#fff", color: "#000", justifySelf: "start" }}>See your result</Link>
    </section>
  );
}

function YourResult({ d }: { d: RoundViewData }) {
  // Each crossed dollar appears once as a sell and once as a buy; count the sell side so nothing is double-counted.
  const sells = d.you.fills.filter((f) => f.side === "SELL");
  const crossed = sells.reduce((s, f) => s + f.crossedUsd, 0);
  const requested = sells.reduce((s, f) => s + f.requestedUsd, 0);
  const leftover = sells.reduce((s, f) => s + (f.residualClass === "DUST" ? 0 : f.residualUsd), 0);
  return (
    <section className={p.youCard} aria-labelledby="you-title">
      <h2 id="you-title" className="h3">Your result</h2>
      {d.you.legs.length === 0 ? <p>None of your trade crossed in this round.</p> : d.you.legs.map((l, i) => (
        <div key={i} className={p.youLine}><span>{l.direction === "SEND" ? "You send" : "You receive"} <span className="num">{tokens(l.amountTokens)}</span> {l.symbol} {l.direction === "SEND" ? "to" : "from"} {l.counterparty}</span><span className="num">{usd(l.valueUsd)}</span></div>
      ))}
      <div className={p.youLine}><span>Crossed</span><span className="num">{requested > 0 ? `${((crossed / requested) * 100).toFixed(0)}% · ${usd(crossed)}` : "0%"}</span></div>
      <div className={p.youLine}><span>Left over to sell</span><span className="num">{usd(leftover)}</span></div>
    </section>
  );
}

function Match({ d, refresh }: Props) {
  const [graph, setGraph] = useState(false);
  if (!d.you.signed) return <div className={p.empty}><h3>You didn't take part in this round</h3><p className="muted">Only members who signed an intent see their result.</p></div>;
  if (COLLECTING.has(d.round.state) || SOLVING.has(d.round.state)) return <div className={p.empty}><h3>Not solved yet</h3><p className="muted">Results appear when collection closes.</p><Link className="btn btn-secondary btn-sm" href={`/round/${d.round.id}/lobby`}>Back to lobby</Link></div>;
  return (
    <div className={p.split}>
      <div className={p.stack}>
        <YourResult d={d} />
        {d.you.inPlan && PROPOSAL.has(d.round.state) && <Link href={`/round/${d.round.id}/proposal`} className="btn btn-primary" style={{ justifySelf: "start" }}>Review your plan</Link>}
        {d.you.inPlan && (SETTLING.has(d.round.state) || d.round.state === "COMPLETE") && <Link href={`/round/${d.round.id}/execute`} className="btn btn-primary" style={{ justifySelf: "start" }}>Go to execution</Link>}
        {d.graph && (
          <section className={p.panel}>
            <div className={p.panelHead}><h2>How the round crossed</h2><button type="button" className="btn btn-quiet btn-sm" aria-expanded={graph} onClick={() => setGraph(!graph)}>{graph ? "Hide graph" : "Show graph"}</button></div>
            {graph && <CrossingGraph round={d.graph} mode="VENUE0" caption={`Round ${d.round.sequence} crossing graph`} />}
          </section>
        )}
        {d.round.state === "NO_CROSS" && <ResidualDecision d={d} refresh={refresh} />}
      </div>
      <section className={p.soft}>
        <div className={p.panelHead}><h2>Whole round</h2></div>
        <dl className="kv">
          <div><dt>Members signed</dt><dd>{d.aggregate.signed}</dd></div>
          <div><dt>Crossing</dt><dd>{d.aggregate.participants}</dd></div>
          <div><dt>Requested</dt><dd>{usd(d.aggregate.requestedUsd)}</dd></div>
          <div><dt>Crossed</dt><dd>{usd(d.aggregate.crossedUsd)}</dd></div>
          <div><dt>Cross rate</dt><dd>{(d.aggregate.crossRateBps / 100).toFixed(1)}%</dd></div>
          <div><dt>Cycles</dt><dd>{d.aggregate.cycleCount}</dd></div>
        </dl>
      </section>
    </div>
  );
}

function Proposal({ d, refresh }: Props) {
  const router = useRouter();
  const { signTypedData, send } = useSigner();
  const act = useAction();
  if (!d.you.inPlan || !d.round.planHash) return <div className={p.empty}><h3>No plan for you in this round</h3></div>;
  const open = PROPOSAL.has(d.round.state);
  const missing = d.you.allowances.filter((a) => !a.sufficient);
  const unfunded = d.you.allowances.filter((a) => !a.funded);

  const approve = () =>
    act.run(async (say) => {
      if (!d.you.approved) {
        say("Sign the plan approval in your wallet…");
        const { typedData } = await api<{ typedData: TypedDataDefinition }>(`/api/rounds/${d.round.id}/approval`);
        const signature = await signTypedData(typedData);
        await api(`/api/rounds/${d.round.id}/approval`, { body: { signature } });
      }
      for (const a of missing) {
        say(`Allow the settlement contract to move ${tokens(a.amountTokens)} ${a.symbol}…`);
        await send({ to: a.token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [d.round.settlementContract, a.amountRaw] }) });
      }
      await refresh();
      router.push(`/round/${d.round.id}/execute`);
    });

  return (
    <div className={p.split}>
      <div className={p.stack}>
        <YourResult d={d} />
        <section className={p.panel} aria-labelledby="auth-title">
          <h2 id="auth-title" className="h3">What you're authorizing</h2>
          <p className="muted">You approve this exact plan and nothing else. The settlement contract can only move the amounts above, only to the wallets in the plan, and only until {d.round.planValidUntil ? new Date(d.round.planValidUntil * 1000).toISOString().slice(11, 16) : "?"} UTC. If anyone's balance changes or any participant doesn't approve, nothing moves.</p>
          <dl className="kv">
            <div><dt>Plan</dt><dd>{d.round.settlementTx ? <ExplorerLink href={txLogsUrl(d.round.settlementTx)} value={d.round.planHash} /> : short(d.round.planHash, 10, 8)}</dd></div>
            <div><dt>Approvals</dt><dd>{d.aggregate.approvals} of {d.aggregate.participants}</dd></div>
            <div><dt>Contract</dt><dd><ExplorerLink href={addressUrl(d.round.settlementContract)} value={d.round.settlementContract} head={8} tail={6} /></dd></div>
          </dl>
          {unfunded.length > 0 && <p className={p.error}>Your wallet no longer holds enough {unfunded.map((a) => a.symbol).join(", ")} for this plan. Settlement would fail preflight.</p>}
          {open ? (
            d.you.approved && missing.length === 0 ? (
              <div className={p.actions}><span className="badge badge-verified">You approved</span><Link href={`/round/${d.round.id}/execute`} className="btn btn-primary">Go to execution</Link></div>
            ) : (
              <div className={p.actions}><button type="button" className="btn btn-primary" disabled={act.pending} onClick={approve}>{act.pending ? act.status ?? "Working…" : "Approve & execute"}</button></div>
            )
          ) : <p className="muted">Approvals are closed ({STATE_WORDS[d.round.state]}).</p>}
          {act.error && <p className={p.error} role="alert">{act.error}</p>}
        </section>
      </div>
      <section className={p.soft}>
        <div className={p.panelHead}><h2>Steps in your wallet</h2></div>
        <ol className={p.list}>
          <li className="muted">1. Sign the plan approval (a signature, no gas).</li>
          <li className="muted">2. Allow the settlement contract to move exactly what you send{missing.length === 0 ? " (already done)" : ""}.</li>
          <li className="muted">3. Once everyone approves, any participant sends the settlement.</li>
        </ol>
      </section>
    </div>
  );
}

function Execute({ d, refresh }: Props) {
  const { send } = useSigner();
  const act = useAction();
  const s = d.round.state;
  const step = (done: boolean, pending: boolean, fail = false) => (fail ? rp.dotFail : done ? rp.dotDone : pending ? rp.dotPending : rp.dotSkip);
  const settledish = SETTLING.has(s) || s === "COMPLETE" || s === "VERIFICATION_FAILED" || s === "SETTLEMENT_REVERTED";

  const settle = () =>
    act.run(async (say) => {
      const call = await api<{ to: Hex; data: Hex }>(`/api/rounds/${d.round.id}/settle`);
      say("Confirm the settlement transaction in your wallet…");
      const txHash = await send(call);
      say("Verifying the settlement onchain…");
      await api(`/api/rounds/${d.round.id}/settle`, { body: { txHash } });
      await refresh();
    });

  return (
    <div className={p.split}>
      <div className={p.stack}>
        <section className={p.panel} aria-labelledby="rail-title">
          <h2 id="rail-title" className="h3">Live execution</h2>
          <div className={rp.rail}>
            <div className={rp.railStep}><span className={`${rp.railDot} ${step(d.aggregate.approvals === d.aggregate.participants, true)}`}>1</span><div><p className={rp.railTitle}>Everyone approves the plan</p><p className={rp.railDetail}>{d.aggregate.approvals} of {d.aggregate.participants} approved{d.you.approved ? ", including you" : ""}.</p></div><span className={rp.railState}>{d.aggregate.approvals}/{d.aggregate.participants}</span></div>
            <div className={rp.railStep}><span className={`${rp.railDot} ${step(settledish || d.you.allowances.every((a) => a.sufficient), true)}`}>2</span><div><p className={rp.railTitle}>Your allowance</p><p className={rp.railDetail}>{settledish ? "Used by the settlement." : d.you.allowances.map((a) => `${a.symbol} ${a.sufficient ? "ready" : "missing"}`).join(" · ") || "Nothing to send."}</p></div></div>
            <div className={rp.railStep}><span className={`${rp.railDot} ${step(Boolean(d.round.settlementTx) && s !== "SETTLEMENT_REVERTED", s === "READY_TO_SETTLE", s === "SETTLEMENT_REVERTED")}`}>3</span><div><p className={rp.railTitle}>Atomic settlement on Robinhood Chain</p><p className={rp.railDetail}>{d.round.settlementTx ? <a className="link num" href={txUrl(d.round.settlementTx)} target="_blank" rel="noreferrer">{short(d.round.settlementTx, 10, 8)} ↗</a> : s === "READY_TO_SETTLE" ? "Every approval is in. Any participant can send it." : "Waiting for approvals."}</p></div></div>
            <div className={rp.railStep}><span className={`${rp.railDot} ${step(d.round.verification?.status === "PASS", s === "VERIFYING" || s === "SETTLING", s === "VERIFICATION_FAILED")}`}>4</span><div><p className={rp.railTitle}>Independent verification</p><p className={rp.railDetail}>{d.round.verification ? `${d.round.verification.checks.filter((c) => c.status === "PASS").length} of ${d.round.verification.checks.length} checks passed from chain data alone.` : "Runs from receipt, calldata, logs and balances."}</p></div></div>
          </div>
          {s === "READY_TO_SETTLE" && <div className={p.actions}><button type="button" className="btn btn-primary" disabled={act.pending} onClick={settle}>{act.pending ? act.status ?? "Working…" : "Send settlement"}</button></div>}
          {PROPOSAL.has(s) && s !== "READY_TO_SETTLE" && !d.you.approved && <Link href={`/round/${d.round.id}/proposal`} className="btn btn-primary" style={{ justifySelf: "start" }}>Approve your plan</Link>}
          {act.error && <p className={p.error} role="alert">{act.error}</p>}
          {s === "SETTLEMENT_REVERTED" && <p className={p.error}>The settlement transaction reverted. No tokens moved.</p>}
        </section>
        {s === "COMPLETE" && <ResidualDecision d={d} refresh={refresh} />}
      </div>
      <div className={p.stack}>
        <YourResult d={d} />
        {(s === "COMPLETE" || s === "VERIFICATION_FAILED") && <Link href={`/round/${d.round.id}/receipt`} className="btn btn-primary" style={{ justifySelf: "start" }}>Open receipt</Link>}
      </div>
    </div>
  );
}

/** A shortened value that opens where the explorer shows it in full. */
function ExplorerLink({ href, value, head = 10, tail = 8 }: { href: string; value: string; head?: number; tail?: number }) {
  return (
    <a className="link num" href={href} target="_blank" rel="noreferrer" title={value}>
      {short(value, head, tail)} ↗
    </a>
  );
}

/**
 * Verifier details carry addresses, plan hashes and 70-digit nonces. Each is shortened and linked: addresses to their
 * page, hashes and nonces to the settlement's event logs (PlanSettled, NonceConsumed), where they appear in full.
 */
function DetailWithLinks({ text, txHash }: { text: string; txHash: string | null }) {
  const parts = text.split(/(0x[0-9a-fA-F]{40,64}|\b\d{20,}\b)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^0x[0-9a-fA-F]{40}$/.test(part)) return <ExplorerLink key={i} href={addressUrl(part)} value={part} head={8} tail={6} />;
        if (/^0x[0-9a-fA-F]{64}$/.test(part)) return txHash ? <ExplorerLink key={i} href={txLogsUrl(txHash)} value={part} /> : <span key={i} title={part}>{short(part, 10, 8)}</span>;
        if (/^\d{20,}$/.test(part)) {
          const label = `${part.slice(0, 6)}…${part.slice(-4)}`;
          return txHash ? <a key={i} className="link num" href={txLogsUrl(txHash)} target="_blank" rel="noreferrer" title={part}>{label} ↗</a> : <span key={i} title={part}>{label}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function permitTypedData(permitData: { domain: Record<string, unknown>; types: Record<string, Array<{ name: string; type: string }>>; values: Record<string, unknown> }): TypedDataDefinition {
  const primaryType = Object.keys(permitData.types).find((t) => t !== "EIP712Domain") as string;
  return { domain: permitData.domain, types: permitData.types, primaryType, message: permitData.values } as unknown as TypedDataDefinition;
}

function ResidualDecision({ d, refresh }: Props) {
  const { signTypedData, send } = useSigner();
  const act = useAction();
  const real = d.you.residual.filter((r) => !r.dust);
  if (d.you.decisions.length > 0) {
    const choice = d.you.decisions[0]?.userChoice;
    const detail = d.you.decisions[0]?.detail as { txHash?: string };
    return (
      <section className={p.panel}>
        <h2 className="h3">Leftovers</h2>
        <p className="muted">{choice === "CARRY_FORWARD" ? "Carried into the next round of this Circle. Your next intent picks it up automatically." : choice === "CANCEL" ? "Dropped. Your target stays saved; nothing else trades." : "Traded on Uniswap from your wallet."}{detail.txHash && <> <a className="link num" href={txUrl(detail.txHash)} target="_blank" rel="noreferrer">{short(detail.txHash, 10, 6)} ↗</a></>}</p>
      </section>
    );
  }
  if (real.length === 0) return <section className={p.panel}><h2 className="h3">Leftovers</h2><p className="muted">{d.you.residual.length ? "Only rounding dust is left, below what any venue would trade." : "Everything you asked for crossed. Nothing is left."}</p></section>;
  const rec = d.you.recommendation;

  const decide = (choice: "CARRY_FORWARD" | "CANCEL") => act.run(async () => {
    await api(`/api/rounds/${d.round.id}/residual`, { body: { choice, engineDecision: rec?.decision ?? "NONE" } });
    await refresh();
  });

  const trade = () =>
    act.run(async (say) => {
      say("Getting a Uniswap quote…");
      let prep = await api<{ approval: { to: Hex; data: Hex; value: string } | null; permitData: Parameters<typeof permitTypedData>[0] | null }>(`/api/rounds/${d.round.id}/residual/swap`, { body: { step: "prepare" } });
      if (prep.approval) {
        say("Approve Uniswap's Permit2 in your wallet…");
        await send(prep.approval);
        prep = await api(`/api/rounds/${d.round.id}/residual/swap`, { body: { step: "prepare" } });
      }
      let permitSignature: Hex | null = null;
      if (prep.permitData) {
        say("Sign the Permit2 message…");
        permitSignature = await signTypedData(permitTypedData(prep.permitData));
      }
      const { tx } = await api<{ tx: { to: Hex; data: Hex; value: string; gasLimit?: string } }>(`/api/rounds/${d.round.id}/residual/swap`, { body: { step: "build", permitSignature } });
      say("Confirm the swap in your wallet…");
      const txHash = await send({ to: tx.to, data: tx.data, value: tx.value, ...(tx.gasLimit ? { gas: tx.gasLimit } : {}) });
      say("Checking the swap onchain…");
      await api(`/api/rounds/${d.round.id}/residual/swap`, { body: { step: "record", txHash } });
      await refresh();
    });

  return (
    <section className={p.panel} aria-labelledby="left-title">
      <h2 id="left-title" className="h3">What's left over</h2>
      <p className="muted">These parts of your rebalance didn't find a match in this round:</p>
      <ul className={p.list}>{real.map((r) => <li key={r.symbol + r.side}><span className={`badge ${r.side === "SELL" ? "badge-neutral" : "badge-cross"}`}>{r.side === "SELL" ? "Still to sell" : "Still to buy"}</span> <span className="num">{tokens(r.amountTokens)}</span> {r.symbol} · <span className="num">{usd(r.valueUsd)}</span></li>)}</ul>
      {rec && (
        <div className={p.soft} style={{ padding: 16 }}>
          <p><strong style={{ fontWeight: 500 }}>Venue0 suggests: {rec.decision ? RESIDUAL_WORDS[rec.decision] ?? rec.decision : "Carry into the next round"}</strong></p>
          {rec.reasons.map((r) => <p key={r} className="muted" style={{ fontSize: 14 }}>{r}</p>)}
          {rec.unavailable && <p className="muted" style={{ fontSize: 14 }}>{rec.unavailable}</p>}
          {rec.canExecute && rec.sell && rec.buy && rec.buyOutTokens !== null && <p className="muted" style={{ fontSize: 14 }}>Uniswap would swap {tokens(rec.sell.amountTokens)} {rec.sell.symbol} for about {tokens(rec.buyOutTokens)} {rec.buy.symbol} right now.</p>}
        </div>
      )}
      <div className={p.actions}>
        <button type="button" className={`btn ${rec?.decision === "AGGREGATE" || !rec?.canExecute ? "btn-primary" : "btn-secondary"}`} disabled={act.pending} onClick={() => decide("CARRY_FORWARD")}>Carry into the next round</button>
        {rec?.canExecute && <button type="button" className={`btn ${rec.decision === "EXECUTE_NOW" ? "btn-primary" : "btn-secondary"}`} disabled={act.pending} onClick={trade}>{act.pending && act.status ? act.status : "Trade it now on Uniswap"}</button>}
        <button type="button" className="btn btn-quiet" disabled={act.pending} onClick={() => decide("CANCEL")}>Drop it</button>
      </div>
      {act.error && <p className={p.error} role="alert">{act.error}</p>}
    </section>
  );
}

function Receipt({ d }: { d: RoundViewData }) {
  const [graph, setGraph] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!d.you.signed) return <div className={p.empty}><h3>No receipt</h3><p className="muted">You didn't take part in this round.</p></div>;
  const v = d.round.verification;
  return (
    <div className={p.split}>
      <div className={p.stack}>
        <section className={p.panel} aria-labelledby="rc-title">
          <div className={p.panelHead}>
            <h2 id="rc-title">{d.circle.name} · Round {d.round.sequence}</h2>
            <span className={`badge ${v?.status === "PASS" ? "badge-verified" : d.round.state === "NO_CROSS" ? "badge-neutral" : "badge-warn"}`}>{v?.status === "PASS" ? "Verified onchain" : STATE_WORDS[d.round.state]}</span>
          </div>
          {d.you.legs.length === 0 ? <p className="muted">Nothing crossed for you in this round.</p> : (
            <ul className={p.list}>{d.you.legs.map((l, i) => <li key={i} className={p.listRow} style={{ background: "var(--surface)" }}><span>{l.direction === "SEND" ? "Sent" : "Received"} <span className="num">{tokens(l.amountTokens)}</span> {l.symbol} {l.direction === "SEND" ? "to" : "from"} {l.counterparty}</span><span className="num">{usd(l.valueUsd)}</span></li>)}</ul>
          )}
          <dl className="kv">
            {d.round.settlementTx && <div><dt>Settlement</dt><dd><a className="link" href={txUrl(d.round.settlementTx)} target="_blank" rel="noreferrer">{short(d.round.settlementTx, 10, 8)} ↗</a></dd></div>}
            {v?.blockNumber !== null && v?.blockNumber !== undefined && <div><dt>Block</dt><dd><a className="link" href={blockUrl(String(v.blockNumber))} target="_blank" rel="noreferrer">{String(v.blockNumber)} ↗</a></dd></div>}
            {d.round.planHash && <div><dt>Plan</dt><dd>{d.round.settlementTx ? <ExplorerLink href={txLogsUrl(d.round.settlementTx)} value={d.round.planHash} /> : short(d.round.planHash, 10, 8)}</dd></div>}
            <div><dt>Snapshot</dt><dd>{d.round.settlementTx ? <ExplorerLink href={txUrl(d.round.settlementTx)} value={d.round.snapshotHash} /> : short(d.round.snapshotHash, 10, 8)}</dd></div>
            <div><dt>Contract</dt><dd><ExplorerLink href={addressUrl(d.round.settlementContract)} value={d.round.settlementContract} head={8} tail={6} /></dd></div>
            <div><dt>Leftovers</dt><dd>{d.you.decisions[0] ? RESIDUAL_WORDS[d.you.decisions[0].userChoice === "CARRY_FORWARD" ? "AGGREGATE" : d.you.decisions[0].userChoice] ?? d.you.decisions[0].userChoice : d.you.residual.some((r) => !r.dust) ? "Not decided yet" : "None"}</dd></div>
          </dl>
          <div className={p.actions}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true))}>{copied ? "Link copied" : "Share receipt"}</button>
            {d.graph && <button type="button" className="btn btn-quiet btn-sm" aria-expanded={graph} onClick={() => setGraph(!graph)}>{graph ? "Hide graph" : "Graph view"}</button>}
          </div>
          <p className="faint" style={{ fontSize: 13 }}>Shared receipts open only for members of this Circle.</p>
        </section>
        {graph && d.graph && <section className={p.panel}><CrossingGraph round={d.graph} mode="VENUE0" animate={false} caption={`Round ${d.round.sequence} crossing graph`} /></section>}
      </div>
      <section className={p.soft} aria-labelledby="ver-title">
        <div className={p.panelHead}><h2 id="ver-title">Verification</h2></div>
        {v ? (
          <ul className={p.list}>{v.checks.map((c) => <li key={c.name} className={p.check}><span className={`badge ${c.status === "PASS" ? "badge-verified" : c.status === "FAIL" ? "badge-fail" : "badge-warn"}`}>{c.status}</span> {c.name}<br /><span className="faint"><DetailWithLinks text={c.detail} txHash={d.round.settlementTx} /></span></li>)}</ul>
        ) : <p className="muted">{d.round.state === "NO_CROSS" ? "No settlement happened, so there is nothing to verify." : "Not verified yet."}</p>}
        {v?.providers && <p className={`faint ${p.wrap}`} style={{ fontSize: 13 }}>Read through {v.providers.verifier}; the settlement was sent through {v.providers.executor}. {v.providers.independent ? "Independent providers." : `Same provider, so this is not an independent check.${v.providers.fallbackReason ? ` Reason: ${v.providers.fallbackReason}.` : ""}`}</p>}
      </section>
    </div>
  );
}
