import type { Metadata } from "next";
import Link from "next/link";
import { activityLine, STATE_WORDS } from "@/lib/activity-words";
import { usd } from "@/lib/format";
import { requireUser } from "@/lib/server/guard";
import { homeData } from "@/lib/server/home";
import p from "@/components/product/product.module.css";

export const metadata: Metadata = { title: "Home · Venue0" };
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const h = await homeData(user.address);
  const positions = h.portfolio.ok ? h.portfolio.positions : [];
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Your portfolio</h1>
          <p className="muted">Live from Robinhood Chain{h.portfolio.ok ? ` · read ${h.portfolio.readAt.slice(11, 16)} UTC` : ""}</p>
        </div>
        <div className={p.actions}>
          <Link href="/portfolio" className="btn btn-secondary btn-sm">Edit target</Link>
          <Link href="/circles" className="btn btn-primary btn-sm">Find liquidity in Venue0</Link>
        </div>
      </header>

      <div className={p.split}>
        <section className={p.panel} aria-labelledby="value-title">
          <div className={p.panelHead}><h2 id="value-title">Holdings</h2>{h.target && <span className="badge badge-cross">Off target by {h.totalDrift.toFixed(1)}%</span>}</div>
          {!h.portfolio.ok && <p className={p.error}>Couldn't read your wallet right now: {h.portfolio.detail}</p>}
          {h.portfolio.ok && positions.length === 0 && (
            <div className={p.empty}>
              <h3>No Stock Tokens yet</h3>
              <p className="muted">This wallet holds no canonical Stock Tokens on Robinhood Chain. Send some to <span className="num">{user.address}</span> and they'll show up here.</p>
            </div>
          )}
          {positions.length > 0 && h.portfolio.ok && (
            <>
              <p className={p.big}>{usd(h.portfolio.totalUsd)}</p>
              {h.target ? (
                <div className={p.list} aria-label="Drift from target">
                  {h.drift.map((d) => (
                    <div key={d.symbol} className={p.driftRow}>
                      <span style={{ fontWeight: 500 }}>{d.symbol}</span>
                      <div className={p.bar} aria-hidden="true"><div className={p.barFill} style={{ width: `${Math.min(100, d.currentPct)}%` }} /><div className={p.barTarget} style={{ left: `${Math.min(100, d.targetPct)}%` }} /></div>
                      <span className="num muted" style={{ textAlign: "right" }}>{d.currentPct.toFixed(1)}% → {d.targetPct.toFixed(1)}%</span>
                    </div>
                  ))}
                  <p className="faint" style={{ fontSize: 13 }}>Black is where you are, the blue mark is your target.</p>
                </div>
              ) : (
                <div className={p.empty}>
                  <h3>No target yet</h3>
                  <p className="muted">Tell Venue0 where you want to be and it will show how far you are from it.</p>
                  <Link href="/portfolio" className="btn btn-primary btn-sm">Set a target</Link>
                </div>
              )}
            </>
          )}
        </section>

        <div className={p.stack}>
          <section className={p.soft} aria-labelledby="next-title">
            <div className={p.panelHead}><h2 id="next-title">Next round</h2></div>
            {h.liveRounds.length === 0 ? (
              <div className={p.list}>
                <p className="muted">{h.circles.length === 0 ? "You're not in a Circle yet. Rounds happen inside Circles." : "None of your Circles has a round running. Open one from a Circle's page."}</p>
                <Link href="/circles" className="btn btn-primary btn-sm" style={{ justifySelf: "start" }}>{h.circles.length === 0 ? "Find a Circle" : "Go to my Circles"}</Link>
              </div>
            ) : (
              <div className={p.list}>
                {h.liveRounds.map(({ circle, round }) => round && (
                  <Link key={round.id} href={`/round/${round.id}/lobby`} className={p.listRow} style={{ background: "var(--paper)" }}>
                    <span><span className={p.listTitle}>{circle.name}</span><br /><span className={p.listSub}>Round {round.sequence} · {STATE_WORDS[round.state] ?? round.state}</span></span>
                    <span className="badge badge-cross">Open</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className={p.soft} aria-labelledby="res-title">
            <div className={p.panelHead}><h2 id="res-title">Leftovers</h2></div>
            {h.carried.length === 0 ? <p className="muted">Nothing is waiting. Anything a round can't cross shows up here if you carry it forward.</p> : (
              <ul className={p.list}>{h.carried.map((c) => <li key={c.round_id + c.asset_uid} className="muted">{c.side === "SELL" ? "Sell" : "Buy"} leftover carried into the next {c.name} round</li>)}</ul>
            )}
          </section>
        </div>
      </div>

      <section className={p.panel} style={{ marginTop: 20 }} aria-labelledby="act-title">
        <div className={p.panelHead}><h2 id="act-title">Recent activity</h2><Link href="/activity" className="link">All activity</Link></div>
        {h.activity.length === 0 ? <p className="muted">No activity yet.</p> : (
          <ul className={p.list}>
            {h.activity.map((a) => (
              <li key={a.id} className={p.listRow}>
                <span>{a.roundId ? <Link className="link" href={`/round/${a.roundId}`}>{activityLine(a.kind, a.detail)}</Link> : activityLine(a.kind, a.detail)}</span>
                <span className="faint num" style={{ fontSize: 13 }}>{new Date(a.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
