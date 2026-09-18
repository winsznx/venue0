import type { Metadata } from "next";
import Link from "next/link";
import { cadence, VISIBILITY_WORDS } from "@/lib/circle-words";
import { listMyCircles, listPublicCircles, type Circle } from "@/lib/server/circles";
import { requireUser } from "@/lib/server/guard";
import p from "@/components/product/product.module.css";

export const metadata: Metadata = { title: "Circles · Venue0" };
export const dynamic = "force-dynamic";

function CircleRow({ c, mine }: { c: Circle; mine: boolean }) {
  return (
    <Link href={`/circles/${c.id}`} className={p.listRow}>
      <span style={{ minWidth: 0 }}>
        <span className={p.listTitle}>{c.name}</span>
        <br />
        <span className={p.listSub}>{c.assetSymbols.join(" · ")} · {cadence(c.cadenceSec)} · {c.memberCount} member{c.memberCount === 1 ? "" : "s"}</span>
      </span>
      <span className={`badge ${mine ? "badge-verified" : "badge-neutral"}`}>{mine ? "Member" : VISIBILITY_WORDS[c.visibility]}</span>
    </Link>
  );
}

export default async function CirclesPage() {
  const user = await requireUser();
  const [mine, discover] = await Promise.all([listMyCircles(user.address), listPublicCircles()]);
  const mineIds = new Set(mine.map((c) => c.id));
  const others = discover.filter((c) => !mineIds.has(c.id));
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Circles</h1>
          <p className="muted">A Circle is a group that rebalances the same Stock Tokens together. Each round, members' opposite trades cross wallet to wallet.</p>
        </div>
        <Link href="/circles/new" className="btn btn-primary btn-sm">Create a Circle</Link>
      </header>

      <div className={p.split}>
        <section className={p.panel} aria-labelledby="mine-title">
          <div className={p.panelHead}><h2 id="mine-title">My Circles</h2></div>
          {mine.length === 0 ? (
            <div className={p.empty}>
              <h3>You're not in a Circle yet</h3>
              <p className="muted">Join a public one below, open an invite link someone sent you, or start your own.</p>
            </div>
          ) : (
            <div className={p.list}>{mine.map((c) => <CircleRow key={c.id} c={c} mine />)}</div>
          )}
        </section>
        <section className={p.soft} aria-labelledby="disc-title">
          <div className={p.panelHead}><h2 id="disc-title">Discover</h2></div>
          {others.length === 0 ? (
            <p className="muted">{discover.length === 0 ? "No public Circles exist yet. The first one you create can be public." : "You're already in every public Circle."}</p>
          ) : (
            <div className={p.list}>{others.map((c) => <CircleRow key={c.id} c={c} mine={false} />)}</div>
          )}
        </section>
      </div>
    </>
  );
}
