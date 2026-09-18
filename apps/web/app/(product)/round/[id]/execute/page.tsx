import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ResidualPanel } from "@/components/residual-panel";
import { RoundHeader } from "@/components/round-header";
import { IconCheck } from "@/components/icons";
import { getRound, type Round } from "@/lib/data";
import { residualOutcome } from "@/lib/residual-outcome";
import { short } from "@/lib/format";
import styles from "../round-pages.module.css";

type Step = { title: string; detail: React.ReactNode; state: "done" | "pending" | "skip" | "fail"; stateLabel: string };

function steps(round: Round): Step[] {
  const signed = round.participants.filter((p) => p.signature).length;
  const settled = round.settlement?.status === "success";
  const outcome = residualOutcome(round);
  const verified = round.verifier?.status === "PASS";
  const independent = round.independentVerification.find((v) => v.status === "PASS");
  const residualStep: Step =
    outcome.kind === "UNISWAP_EXECUTED" ? { title: "External execution", detail: <>Uniswap swap <a className="link num" href={outcome.explorer} target="_blank" rel="noreferrer">{short(outcome.txHash)} ↗</a></>, state: "done", stateLabel: "complete" }
    : outcome.kind === "FLASH_BOUNDARY" ? { title: "External execution", detail: <>Flash limit order filled (boundary case: fee {(outcome.feeBps / 100).toFixed(1)}% of residual). The current engine would aggregate.</>, state: "done", stateLabel: "filled" }
    : outcome.kind === "NOT_EXECUTED" ? { title: "External execution", detail: "Residual not executed in this proof run; it stayed in the wallets.", state: "skip", stateLabel: "not executed" }
    : { title: "External execution", detail: "No external residual; only rounding dust remained.", state: "skip", stateLabel: "not needed" };
  return [
    { title: "Intents signed", detail: `${signed} of ${round.participants.length} portfolios signed EIP-712 intents`, state: signed === round.participants.length ? "done" : "fail", stateLabel: `${signed}/${round.participants.length}` },
    { title: "Venue0 plan approved", detail: round.plan ? <>Every participant signed plan <span className="num">{short(round.plan.planHash, 8, 6)}</span></> : "No plan: nothing crossed", state: round.plan ? "done" : "skip", stateLabel: round.plan ? `${round.plan.approvals.length} approvals` : "none" },
    { title: "Exact allowances", detail: round.plan ? `${round.plan.allowanceTxs.length} approve transactions, one per leg, for the exact amount` : "Not needed", state: round.plan ? "done" : "skip", stateLabel: round.plan ? "set" : "none" },
    { title: "Atomic settlement", detail: round.settlement ? <>All legs in one transaction <a className="link num" href={round.settlement.explorer} target="_blank" rel="noreferrer">{short(round.settlement.txHash)} ↗</a>, block <span className="num">{round.settlement.block.toLocaleString()}</span></> : "No transaction", state: settled ? "done" : round.settlement ? "fail" : "skip", stateLabel: settled ? "success" : round.settlement ? "reverted" : "none" },
    { title: "Residual evaluated", detail: outcome.kind === "FLASH_BOUNDARY" ? "Residual engine chose a route (see below)" : outcome.kind === "DUST_ONLY" ? "Only dust below the $0.10 threshold" : "Residual computed exactly from the plan", state: "done", stateLabel: "done" },
    residualStep,
    { title: "Independent verification", detail: round.verifier ? <>Verifier: {round.verifier.checks.filter((c) => c.status === "PASS").length}/{round.verifier.checks.length} checks{independent ? <>; re-verified via {independent.provider} ({independent.passed}/{independent.total})</> : ""}</> : "No settlement to verify", state: verified ? "done" : round.verifier ? "fail" : "skip", stateLabel: round.verifier?.status ?? "none" },
  ];
}

export default async function Execute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const round = getRound(id);
  if (!round) notFound();
  const list = steps(round);
  const complete = round.verifier?.status === "PASS";
  return (
    <>
      <Suspense><RoundHeader round={round} /></Suspense>
      <div className={styles.twoCol}>
        <section className={styles.sheet} aria-labelledby="rail-title">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 id="rail-title" className="h3">Execution</h2>
            <span className={`badge ${complete ? "badge-verified" : "badge-warn"}`}>{complete ? "Complete · verified" : "Not complete"}</span>
          </div>
          <ol className={styles.rail} style={{ marginTop: 8 }}>
            {list.map((s) => (
              <li key={s.title} className={styles.railStep}>
                <span className={`${styles.railDot} ${s.state === "done" ? styles.dotDone : s.state === "pending" ? styles.dotPending : s.state === "fail" ? styles.dotFail : styles.dotSkip}`}>
                  {s.state === "done" ? <IconCheck /> : s.state === "fail" ? "!" : "–"}
                  <span className="sr-only">{s.state}</span>
                </span>
                <span>
                  <span className={styles.railTitle} style={{ display: "block" }}>{s.title}</span>
                  <span className={styles.railDetail} style={{ display: "block" }}>{s.detail}</span>
                </span>
                <span className={styles.railState}>{s.stateLabel}</span>
              </li>
            ))}
          </ol>
          {complete && <Link href={`/round/${round.key}/receipt`} className="btn btn-primary" style={{ marginTop: 8 }}>Open receipt</Link>}
        </section>
        <ResidualPanel round={round} />
      </div>
    </>
  );
}
