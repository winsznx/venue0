import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RoundHeader } from "@/components/round-header";
import { RoundView } from "@/components/round-view";
import { getRound, rounds } from "@/lib/data";
import { usd } from "@/lib/format";

export function generateStaticParams() {
  return rounds.map((r) => ({ id: r.key }));
}

export default async function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const round = getRound(id);
  if (!round) notFound();
  return (
    <>
      <Suspense><RoundHeader round={round} /></Suspense>
      <Suspense><RoundView round={round} /></Suspense>

      <div className="section-title"><h2>Portfolio changes</h2><span className="faint">requested, crossed and residual per signed intent</span></div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Portfolio</th><th>Asset</th><th>Side</th><th className="r">Requested</th><th className="r">Crossed</th><th className="r">Residual</th><th>Residual type</th></tr>
          </thead>
          <tbody>
            {round.fills.map((f) => {
              const p = round.participants.find((x) => x.address === f.owner);
              return (
                <tr key={f.owner + f.symbol + f.side}>
                  <td>{p?.label}<br /><span className="faint" style={{ fontSize: 13 }}>{p?.kind}</span></td>
                  <td>{f.symbol}</td>
                  <td>{f.side === "SELL" ? "Sell" : "Buy"}</td>
                  <td className="r num">{usd(f.requestedUsd)}</td>
                  <td className="r num">{usd(f.crossedUsd)}</td>
                  <td className="r num">{usd(f.residualUsd)}</td>
                  <td>{f.residualClass === "NONE" ? "None" : f.residualClass === "DUST" ? "Rounding dust" : "External"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {round.status === "NO_CROSS" && (
        <p className="tile" style={{ padding: 20, marginTop: 16 }}>
          Nothing in this round was complementary: every portfolio wanted to buy AAPL and nobody offered it. Venue0 crossed $0.00 and sent no transaction. The full request stays external. This is the correct result.
        </p>
      )}
    </>
  );
}
