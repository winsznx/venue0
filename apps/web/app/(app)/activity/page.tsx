import type { Metadata } from "next";
import Link from "next/link";
import { activityLine } from "@/lib/activity-words";
import { requireUser } from "@/lib/server/guard";
import { listActivity } from "@/lib/server/users";
import p from "@/components/product/product.module.css";

export const metadata: Metadata = { title: "Activity · Venue0" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await requireUser();
  const items = await listActivity(user.address, 200);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="muted">Everything your wallet did in Venue0, newest first. Onchain steps link to the explorer from their round.</p>
        </div>
      </header>
      <section className={p.panel}>
        {items.length === 0 ? (
          <div className={p.empty}><h3>No activity yet</h3><p className="muted">Save a target or join a Circle and it will show up here.</p><Link href="/circles" className="btn btn-primary btn-sm">Find a Circle</Link></div>
        ) : (
          <ul className={p.list}>
            {items.map((a) => (
              <li key={a.id} className={p.listRow}>
                <span>{a.roundId ? <Link className="link" href={`/round/${a.roundId}`}>{activityLine(a.kind, a.detail)}</Link> : a.circleId ? <Link className="link" href={`/circles/${a.circleId}`}>{activityLine(a.kind, a.detail)}</Link> : activityLine(a.kind, a.detail)}</span>
                <time className="faint num" style={{ fontSize: 13 }} dateTime={a.createdAt}>{a.createdAt.slice(0, 16).replace("T", " ")} UTC</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
