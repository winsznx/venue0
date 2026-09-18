import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RoundHeader } from "@/components/round-header";
import { getRound } from "@/lib/data";
import { pct, short, tokens, usd } from "@/lib/format";
import styles from "../round-pages.module.css";

export default async function Proposal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ as?: string; demo?: string }> }) {
  const { id } = await params;
  const { as, demo } = await searchParams;
  const round = getRound(id);
  if (!round || !round.plan) notFound();
  const me = round.participants.find((p) => p.address.toLowerCase() === as?.toLowerCase()) ?? round.participants[0];
  if (!me) notFound();
  const send = round.legs.filter((l) => l.from === me.address);
  const receive = round.legs.filter((l) => l.to === me.address);
  const myFills = round.fills.filter((f) => f.owner === me.address);
  const crossed = myFills.reduce((s, f) => s + f.crossedUsd, 0);
  const residual = myFills.filter((f) => f.residualClass === "EXTERNAL").reduce((s, f) => s + f.residualUsd, 0);
  const dust = myFills.filter((f) => f.residualClass === "DUST").reduce((s, f) => s + f.residualUsd, 0);
  const approval = round.plan.approvals.find((a) => a.participant.toLowerCase() === me.address.toLowerCase());
  const policy = me.policy as { maxExternalSlippageBps: number; maxReferencePriceDriftBps: number; allowMarketResidual: boolean; allowLimitResidual: boolean; allowTwapResidual: boolean; allowWaitResidual: boolean; allowPartialCross: boolean; urgency: string };
  const expiry = new Date(round.plan.validUntil * 1000);

  return (
    <>
      <Suspense><RoundHeader round={round} /></Suspense>

      <div className={styles.switcher} role="group" aria-label="View proposal as">
        <span className="muted">Viewing as</span>
        {round.participants.map((p) => (
          <Link key={p.address} href={`/round/${round.key}/proposal?as=${p.address}${demo ? "&demo=1" : ""}`} className={`chip ${p.address === me.address ? styles.chipActive : ""}`} aria-current={p.address === me.address ? "true" : undefined}>{p.label}</Link>
        ))}
      </div>

      <div className={styles.twoCol}>
        <section className={styles.sheet} aria-labelledby="authorize-title">
          <h2 id="authorize-title" className="h3">What {me.label} authorizes</h2>
          <p className="muted" style={{ marginTop: 6 }}>{me.kind}. The wallet signs this exact plan; any change to it invalidates the signature.</p>

          <div className={styles.flowGrid}>
            <div>
              <p className={styles.flowLabel}>You send</p>
              {send.length === 0 ? <p className="faint">Nothing</p> : send.map((l) => (
                <p key={l.symbol + l.to} className={styles.flowLine}><span className="num">{tokens(l.amountTokens)}</span> {l.symbol} <span className="faint">to {round.participants.find((p) => p.address === l.to)?.label}</span><span className="num faint">{usd(l.valueUsd)}</span></p>
              ))}
            </div>
            <div>
              <p className={styles.flowLabel}>You receive</p>
              {receive.length === 0 ? <p className="faint">Nothing</p> : receive.map((l) => (
                <p key={l.symbol + l.from} className={styles.flowLine}><span className="num">{tokens(l.amountTokens)}</span> {l.symbol} <span className="faint">from {round.participants.find((p) => p.address === l.from)?.label}</span><span className="num faint">{usd(l.valueUsd)}</span></p>
              ))}
            </div>
          </div>

          <dl className="kv" style={{ marginTop: 8 }}>
            <div><dt>Crossed internally</dt><dd>{usd(crossed)}</dd></div>
            <div><dt>Residual for external execution</dt><dd>{usd(residual)}{dust > 0 ? ` (+${usd(dust)} dust)` : ""}</dd></div>
            <div><dt>Target error</dt><dd>{me.allocationErrorBeforeBps !== null && me.allocationErrorAfterBps !== null ? `${pct(me.allocationErrorBeforeBps)} → ${pct(me.allocationErrorAfterBps)}` : "n/a"}</dd></div>
          </dl>
        </section>

        <section className={styles.sheet} aria-labelledby="constraints-title">
          <h2 id="constraints-title" className="h3">Execution constraints</h2>
          <dl className="kv" style={{ marginTop: 12 }}>
            <div><dt>Plan expires</dt><dd>{expiry.toISOString().replace("T", " ").slice(0, 19)} UTC</dd></div>
            <div><dt>Maximum outflow</dt><dd>{me.intent.filter((l) => l.side === "SELL").map((l) => `${tokens(l.amountTokens)} ${l.symbol}`).join(", ") || "none"}</dd></div>
            <div><dt>Max external cost</dt><dd>{policy.maxExternalSlippageBps} bps</dd></div>
            <div><dt>Max price drift from snapshot</dt><dd>{policy.maxReferencePriceDriftBps} bps</dd></div>
            <div><dt>Partial crossing</dt><dd>{policy.allowPartialCross ? "allowed" : "not allowed"}</dd></div>
            <div><dt>External execution preference</dt><dd>{[policy.allowMarketResidual && "market", policy.allowLimitResidual && "limit", policy.allowTwapResidual && "TWAP", policy.allowWaitResidual && "wait"].filter(Boolean).join(", ")}</dd></div>
            <div><dt>Urgency</dt><dd>{policy.urgency.toLowerCase()}</dd></div>
            <div><dt>Plan hash</dt><dd>{short(round.plan.planHash, 10, 8)}</dd></div>
          </dl>
          <div className={styles.approve}>
            <button type="button" className="btn btn-primary" disabled aria-describedby="approve-note">Approve plan</button>
            <p id="approve-note" className="muted">
              {approval ? <>Already approved in the verified round: EIP-712 signature with nonce <span className="num">{short(approval.nonce, 6, 6)}</span> was consumed onchain.</> : "No approval recorded for this participant."}
            </p>
          </div>
          <Link href={`/round/${round.key}/execute${demo ? "?demo=1" : ""}`} className="btn btn-secondary" style={{ marginTop: 12 }}>See how it executed</Link>
        </section>
      </div>
    </>
  );
}
