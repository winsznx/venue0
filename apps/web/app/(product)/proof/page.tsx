import Link from "next/link";
import { IconCircles, IconExternal, IconRound, IconShield, IconWallet } from "@/components/icons";
import { StatusBadge } from "@/components/ui";
import { campaignHeadline } from "@/lib/campaign";
import { getRound, proof } from "@/lib/data";
import { ratio, short, usd } from "@/lib/format";

type Arm = { cross_rate_pooled: number; cross_rate_median: number; external_orders: number; crossed_notional: number; zero_cross_scenarios: number };
type Cohort = { nature: string; arms: Record<string, Arm>; uplift: { multi_party_uplift_pct_of_bilateral: number | null; multi_party_uplift_pct_of_requested: number | null; scenarios_with_uplift: number } };
type Bucket = { scenarios: number; venue0_cross_rate_pooled: number; bilateral_cross_rate_pooled: number; uplift_pct_of_requested: number };

function ProofRow({ icon, title, sub, status, href, hrefLabel }: { icon: React.ReactNode; title: string; sub: React.ReactNode; status: string; href: string; hrefLabel: string }) {
  return (
    <div className="row-item" style={{ gridTemplateColumns: "56px minmax(0,1fr) auto" }}>
      <span className="icon-tile">{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span className="row-item-title" style={{ display: "block" }}>{title}</span>
        <span className="muted" style={{ fontSize: "0.9375rem" }}>{sub}</span>
      </span>
      <span style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <StatusBadge status={status} />
        <a className="link num" href={href} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>{hrefLabel} ↗<span className="sr-only"> (opens on Blockscout)</span></a>
      </span>
    </div>
  );
}

export default function Proof() {
  const g2 = getRound("g2-cycle");
  const l7 = getRound("l7-dynamic");
  const c = campaignHeadline();
  const s = proof.campaign.summary as { overall: { arms: Record<string, Arm> }; cohorts: Record<string, Cohort>; by_complementarity_all: Record<string, Bucket>; by_participant_count_natural: Record<string, Bucket>; solver_latency_ms: { p50: number; p95: number; max: number } };
  const cohorts = s.cohorts;
  const lowComp = s.by_complementarity_all["0.0"];
  const small = ["02", "03"].map((k) => s.by_participant_count_natural[k]).filter((b): b is Bucket => Boolean(b));
  const skew = cohorts.SIZE_SKEW?.arms.VENUE0_CROSSING;
  const low = cohorts.LOW_COMPLEMENTARITY?.arms.VENUE0_CROSSING;
  const index = cohorts.INDEX_REBALANCE;
  const armNames: Record<string, string> = { MARKET_ONLY: "Market only", BILATERAL_ONLY: "Pairwise only (optimal)", VENUE0_CROSSING: "Venue0 crossing", VENUE0_FULL: "Venue0 + residual engine" };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Don&apos;t trust the demo.</h1>
          <p className="muted" style={{ maxWidth: "70ch" }}>Every claim in Venue0 points at a Robinhood Chain transaction or a frozen campaign file. Here they are, including where Venue0 doesn&apos;t help.</p>
        </div>
      </header>

      <div className="section-title"><h2>Live mainnet proof</h2><span className="faint">Robinhood Chain 4663 · operator proof wallets</span></div>
      <div className="row-list">
        {g2?.settlement && <ProofRow icon={<IconRound />} title="3-wallet Stock Token cycle" sub={<>NVDA, AAPL and SPY moved A → C → B → A in one atomic settlement. <Link className="link" href="/round/g2-cycle/receipt">Receipt</Link></>} status={g2.verifier?.status ?? "PASS"} href={g2.settlement.explorer} hrefLabel={short(g2.settlement.txHash)} />}
        <ProofRow icon={<IconWallet />} title="Uniswap residual" sub={<>{proof.uniswap.soldTokens.toFixed(6)} {proof.uniswap.soldSymbol} → {proof.uniswap.receivedTokens.toFixed(6)} {proof.uniswap.receivedSymbol}, {proof.uniswap.routing}, Universal Router {proof.uniswap.routerVersion}</>} status={proof.uniswap.result} href={proof.uniswap.explorer} hrefLabel={short(proof.uniswap.txHash)} />
        <ProofRow icon={<IconExternal size={20} />} title="Flash limit order" sub={<>Filled. Boundary economics: fee {(Number(proof.flash.economics.feeBpsOfNotional) / 100).toFixed(1)}% of a {usd(Number(proof.flash.economics.residualNotionalUsd))} residual; the current engine would aggregate it. <Link className="link" href="/round/l6-flash-round/execute">Details</Link></>} status={proof.flash.status} href={`https://robinhoodchain.blockscout.com/tx/${proof.flash.fillTx}`} hrefLabel={short(proof.flash.fillTx)} />
        {l7?.settlement && <ProofRow icon={<IconCircles />} title="Dynamic agent round" sub="A portfolio agent on a Dynamic server wallet (agent-owned MPC) signed its intent, plan approval and allowance, then settled." status={l7.verifier?.status ?? "PASS"} href={l7.settlement.explorer} hrefLabel={short(l7.settlement.txHash)} />}
        <ProofRow icon={<IconShield />} title="Settlement contract" sub={<span className="num">{proof.settlementContract.address}</span>} status="PASS" href={proof.settlementContract.explorer} hrefLabel="Blockscout" />
      </div>

      <div id="campaign" className="section-title"><h2>Campaign</h2><span className="faint">Synthetic portfolios, not users</span></div>
      <div className="grid-2">
        <div className="tile" style={{ padding: 24, display: "grid", gap: 10, alignContent: "start" }}>
          <p className="h3">{c.scenarios} frozen scenarios, 4 arms</p>
          <p className="muted">Seed, generator, cost curves and metrics were committed before the run. Each arm saw identical intents, prices and quoted costs. Reference parity {c.parityPass}/{c.scenarios}; matcher latency p50 {s.solver_latency_ms.p50} ms, p95 {s.solver_latency_ms.p95} ms.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {[["Methodology", "/campaign/methodology.md"], ["Results write-up", "/campaign/results.md"], ["CSV", "/campaign/results.csv"], ["JSON", "/campaign/results.json"], ["Summary", "/campaign/summary.json"], ["Manifest", "/campaign/manifest.json"]].map(([label, href]) => (
              <a key={href} href={href} className="chip" download={href?.endsWith(".md") ? undefined : ""}>{label}</a>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Arm</th><th className="r">Crossed (pooled)</th><th className="r">Median</th><th className="r">External orders</th></tr></thead>
            <tbody>
              {Object.entries(s.overall.arms).map(([k, a]) => (
                <tr key={k}><td>{armNames[k] ?? k}</td><td className="r num">{ratio(a.cross_rate_pooled)}</td><td className="r num">{ratio(a.cross_rate_median)}</td><td className="r num">{a.external_orders.toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-title"><h2>By cohort</h2><span className="faint">constructed-positive cohorts are not typical behaviour</span></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Cohort</th><th>Nature</th><th className="r">Pairwise only</th><th className="r">Venue0</th><th className="r">Relative uplift</th><th className="r">Zero-cross</th></tr></thead>
          <tbody>
            {Object.entries(cohorts).map(([k, v]) => (
              <tr key={k}>
                <td>{k.replaceAll("_", " ").toLowerCase()}</td>
                <td><span className={`badge ${v.nature === "natural/randomized" ? "badge-neutral" : v.nature === "constructed-positive" ? "badge-cross" : "badge-warn"}`}>{v.nature}</span></td>
                <td className="r num">{ratio(v.arms.BILATERAL_ONLY?.cross_rate_pooled ?? 0)}</td>
                <td className="r num">{ratio(v.arms.VENUE0_CROSSING?.cross_rate_pooled ?? 0)}</td>
                <td className="r num">{v.uplift.multi_party_uplift_pct_of_bilateral === null ? "n/a" : `+${ratio(v.uplift.multi_party_uplift_pct_of_bilateral)}`}</td>
                <td className="r num">{v.arms.VENUE0_CROSSING?.zero_cross_scenarios}/40</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title"><h2>Where Venue0 doesn&apos;t help</h2></div>
      <ul className="grid-2" style={{ gap: 12 }}>
        {[
          lowComp && `Below ~10% complementarity, crossing is ~${ratio(lowComp.venue0_cross_rate_pooled)} (${lowComp.scenarios} scenarios).`,
          small.length > 0 && `Rounds of 2–3 participants gain little: ${small.map((b) => ratio(b.venue0_cross_rate_pooled)).join(" and ")} crossed.`,
          low && `One-directional flows often cross nothing: ${low.zero_cross_scenarios} of 40 low-complementarity scenarios crossed zero.`,
          skew && `A large participant in a small crowd crossed only ${ratio(skew.cross_rate_pooled)} of requested notional.`,
          index && `Template-like rebalances are already captured well by pairwise matching: ${ratio(index.arms.BILATERAL_ONLY?.cross_rate_pooled ?? 0)} pairwise vs ${ratio(index.arms.VENUE0_CROSSING?.cross_rate_pooled ?? 0)} Venue0.`,
          `In absolute terms multi-party matching added about ${(c.upliftAbsolutePts * 100).toFixed(1)} points of requested notional overall (the ${ratio(c.upliftRelative)} figure is relative to the pairwise optimum).`,
        ].filter((x): x is string => Boolean(x)).map((line) => (
          <li key={line} className="tile" style={{ padding: 20 }}>{line}</li>
        ))}
      </ul>
    </>
  );
}
