import Link from "next/link";
import { CreateCircleForm } from "@/components/circle-forms";
import { IconArrow, IconCircles } from "@/components/icons";
import { assetChoices, circles } from "@/lib/server/circles";

export const dynamic = "force-dynamic";

export default async function CirclesPage() {
  const [svc, assets] = await Promise.all([circles(), assetChoices()]);
  const list = svc.listCircles();
  const symbol = new Map(assets.map((a) => [a.uid, a.symbol]));
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Circles</h1>
          <p className="muted" style={{ maxWidth: "68ch" }}>Coordinated liquidity groups. Members share an asset universe and a round schedule, so their rebalances meet in the same round. Only aggregates are ever shown; complete holdings are not.</p>
        </div>
      </header>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <section aria-labelledby="discover">
          <h2 id="discover" style={{ fontSize: "1.25rem", fontWeight: 500, marginBottom: 12 }}>Public circles</h2>
          {list.length === 0 ? (
            <div className="tile" style={{ padding: 24 }}>
              <p className="h3">No circles yet</p>
              <p className="muted" style={{ marginTop: 8 }}>Create the first one. Circles are held in this server&apos;s memory until the database lands, so they reset on restart. Private and invite-only circles are not listed here.</p>
            </div>
          ) : (
            <div className="row-list">
              {list.map((c) => (
                <Link key={c.id} href={`/circles/${c.id}`} className="row-item">
                  <span className="icon-tile"><IconCircles /></span>
                  <span style={{ minWidth: 0 }}>
                    <span className="row-item-title" style={{ display: "block" }}>{c.name}</span>
                    <span className="row-item-sub" style={{ display: "block" }}>{c.allowedAssetUids.map((u) => symbol.get(u) ?? "?").join(", ")}</span>
                  </span>
                  <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="badge badge-neutral">{c.roundCadenceSec ? `every ${c.roundCadenceSec / 3_600}h` : "manual rounds"}</span>
                    <IconArrow />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <CreateCircleForm assets={assets} />
      </div>
    </>
  );
}
