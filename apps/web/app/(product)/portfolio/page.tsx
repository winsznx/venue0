import { PortfolioWorkbench } from "@/components/portfolio-workbench";
import { env } from "@/lib/server/env";
import { loadPortfolio } from "@/lib/server/portfolio";
import { addressUrl, short, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

const PROOF_WALLETS: Record<string, string> = {
  "0x71509d21a26f47f83b36a835bb4619df8f512718": "Portfolio A · operator proof wallet",
  "0x0f199cc71f82f1baa7d731cbd03c6f8895a9d70d": "Portfolio B · operator proof wallet",
  "0x69a0ba2cb75ce834ffbaa258ea2342f862903cae": "Portfolio C · operator proof wallet",
  "0x00db4b5f745da1351eaf687c39107c54e344e87c": "Agent D · Dynamic server wallet",
};
const DEFAULT = "0x71509D21A26F47F83B36A835bB4619Df8F512718";

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ address?: string }> }) {
  const { address = DEFAULT } = await searchParams;
  const result = await loadPortfolio(address);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Your portfolio</h1>
          {result.ok ? (
            <p className="muted" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <a className="link num" href={addressUrl(result.address)} target="_blank" rel="noreferrer">{short(result.address, 8, 6)} ↗</a>
              <span className="badge badge-neutral">{PROOF_WALLETS[result.address.toLowerCase()] ?? "Read-only view"}</span>
              <span className="status status-live"><span className="status-dot" />ROBINHOOD CHAIN {result.chainId}</span>
              <span className="faint" style={{ fontSize: 14 }}>read {result.readAt.slice(11, 19)} UTC</span>
            </p>
          ) : null}
        </div>
        <form method="get" style={{ display: "flex", gap: 8 }}>
          <label htmlFor="address" className="sr-only">View another address</label>
          <input id="address" name="address" defaultValue={address} className="num" style={{ height: 40, width: 360, maxWidth: "60vw", border: "1px solid var(--line)", borderRadius: 999, padding: "0 16px", fontSize: 13 }} />
          <button className="btn btn-secondary btn-sm" type="submit">View</button>
        </form>
      </header>

      {!result.ok ? (
        <div className="tile" style={{ padding: 24 }}>
          <p className="h3">{result.reason === "INVALID_ADDRESS" ? "That isn't a wallet address" : result.reason === "WRONG_CHAIN" ? "Wrong network" : "Robinhood Chain data unavailable"}</p>
          <p className="muted" style={{ marginTop: 8 }}>{result.detail}. {result.reason === "INVALID_ADDRESS" ? "Paste a 0x address." : "Try again in a moment; nothing was assumed in the meantime."}</p>
        </div>
      ) : result.positions.length === 0 ? (
        <div className="tile" style={{ padding: 24 }}>
          <p className="h3">No priceable Stock Tokens here</p>
          <p className="muted" style={{ marginTop: 8 }}>This address holds none of the {result.priceableCount} Stock Tokens Venue0 can value with a Chainlink feed. Fund it with a canonical Stock Token on Robinhood Chain, or view another address.</p>
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 12 }}>Total <span className="num" style={{ color: "var(--ink)" }}>{usd(result.totalUsd)}</span> across {result.positions.length} Stock Tokens · valued with Chainlink feeds, multiplier-adjusted · registry {result.registryResolvedAt.slice(11, 19)} UTC</p>
          <PortfolioWorkbench address={result.address} positions={result.positions} totalUsd={result.totalUsd} agentAvailable={env.anthropicAvailable} />
        </>
      )}
    </>
  );
}
