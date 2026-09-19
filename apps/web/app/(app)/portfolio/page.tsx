import type { Metadata } from "next";
import Link from "next/link";
import { usd } from "@/lib/format";
import { env } from "@/lib/server/env";
import { requireUser } from "@/lib/server/guard";
import { loadPortfolio } from "@/lib/server/portfolio";
import { getTarget } from "@/lib/server/users";
import { TargetEditor } from "@/components/product/target-editor";
import p from "@/components/product/product.module.css";

export const metadata: Metadata = { title: "Portfolio · Venue0" };
export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await requireUser();
  const [portfolio, target] = await Promise.all([loadPortfolio(user.address), getTarget(user.address)]);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Portfolio</h1>
          <p className="muted">Holdings are read live from Robinhood Chain and valued at Chainlink prices. Your target is saved to your account.</p>
        </div>
        {target && <Link href="/circles" className="btn btn-primary btn-sm">Find liquidity in Venue0</Link>}
      </header>

      {!portfolio.ok && <p className={p.error}>Couldn't read your wallet: {portfolio.detail}</p>}
      {portfolio.ok && portfolio.positions.length === 0 && (
        <div className={p.empty}>
          <h3>This wallet holds no Stock Tokens</h3>
          <p className="muted">Venue0 rebalances Stock Tokens you hold on Robinhood Chain. Send some to <span className="num">{user.address}</span>, then reload this page.</p>
        </div>
      )}
      {portfolio.ok && portfolio.positions.length > 0 && (
        <div className={p.split}>
          <section className={p.panel} aria-labelledby="target-title">
            <div className={p.panelHead}><h2 id="target-title">Target</h2>{target && <span className="badge badge-verified">Saved {target.updatedAt.slice(0, 16).replace("T", " ")} UTC</span>}</div>
            <TargetEditor positions={portfolio.positions} totalUsd={portfolio.totalUsd} saved={target ?? null} agentAvailable={env.agentAvailable} defaultMode={user.agentMode} />
          </section>
          <section className={p.soft} aria-labelledby="hold-title">
            <div className={p.panelHead}><h2 id="hold-title">Holdings</h2><span className="num muted">{usd(portfolio.totalUsd)}</span></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Asset</th><th className="r">Value</th><th className="r">Weight</th></tr></thead>
                <tbody>
                  {portfolio.positions.map((x) => (
                    <tr key={x.uid}>
                      <td>{x.symbol}{x.stale && <span className="badge badge-warn" style={{ marginLeft: 8 }}>price stale</span>}</td>
                      <td className="r num">{usd(x.valueUsd)}</td>
                      <td className="r num">{((x.valueUsd / portfolio.totalUsd) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="faint" style={{ fontSize: 13 }}>Read {portfolio.readAt.slice(11, 19)} UTC · {portfolio.priceableCount} Stock Tokens have a Chainlink feed</p>
          </section>
        </div>
      )}
    </>
  );
}
