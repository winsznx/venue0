import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATE_WORDS } from "@/lib/activity-words";
import { cadence, duration, RESIDUAL_BEHAVIOR_WORDS, VISIBILITY_WORDS } from "@/lib/circle-words";
import { findCircle, listMembers, membership } from "@/lib/server/circles";
import { requireUser } from "@/lib/server/guard";
import { roundsForCircle } from "@/lib/server/rounds";
import { CircleActions } from "@/components/product/circle-actions";
import p from "@/components/product/product.module.css";

export const metadata: Metadata = { title: "Circle · Venue0" };
export const dynamic = "force-dynamic";

export default async function CirclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ invite?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { invite } = await searchParams;
  const circle = await findCircle(id);
  const role = circle ? await membership(circle.id, user.address) : undefined;
  if (!circle || (circle.visibility === "PRIVATE" && !role)) notFound();
  const [members, rounds] = await Promise.all([role ? listMembers(circle.id) : Promise.resolve([]), role ? roundsForCircle(circle.id) : Promise.resolve([])]);
  return (
    <>
      <header className="page-head">
        <div>
          <span className="badge badge-neutral">{VISIBILITY_WORDS[circle.visibility]}</span>
          <h1 style={{ marginTop: 10 }}>{circle.name}</h1>
          {circle.description && <p className="muted">{circle.description}</p>}
        </div>
      </header>

      <div className={p.split}>
        <div className={p.stack}>
          <CircleActions circleId={circle.id} role={role ?? null} visibility={circle.visibility} invite={invite ?? null} />
          {role && (
            <section className={p.panel} aria-labelledby="rounds-title">
              <div className={p.panelHead}><h2 id="rounds-title">Rounds</h2></div>
              {rounds.length === 0 ? <p className="muted">No rounds yet. Entering the lobby opens the first one.</p> : (
                <div className={p.list}>
                  {rounds.map((r) => (
                    <Link key={r.id} href={r.state === "OPEN" || r.state === "COLLECTING" ? `/round/${r.id}/lobby` : `/round/${r.id}`} className={p.listRow}>
                      <span><span className={p.listTitle}>Round {r.sequence}</span><br /><span className={p.listSub}>Opened {new Date(r.opensAt * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span></span>
                      <span className="badge badge-neutral">{STATE_WORDS[r.state] ?? r.state}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
        <section className={p.soft} aria-labelledby="rules-title">
          <div className={p.panelHead}><h2 id="rules-title">How this Circle runs</h2></div>
          <dl className="kv">
            <div><dt>Stock Tokens</dt><dd>{circle.assetSymbols.join(", ")}</dd></div>
            <div><dt>Rounds</dt><dd>{cadence(circle.cadenceSec)}</dd></div>
            <div><dt>Collection window</dt><dd>{duration(circle.durationSec)}</dd></div>
            <div><dt>Minimum people</dt><dd>{circle.minParticipants}</dd></div>
            <div><dt>Leftovers</dt><dd>{RESIDUAL_BEHAVIOR_WORDS[circle.residualBehavior]}</dd></div>
            <div><dt>Members</dt><dd>{circle.memberCount}</dd></div>
            <div><dt>Organizer</dt><dd>{circle.organizer.toLowerCase() === user.address.toLowerCase() ? "You" : `${circle.organizer.slice(0, 6)}…${circle.organizer.slice(-4)}`}</dd></div>
          </dl>
          {role && members.length > 0 && <p className="faint" style={{ fontSize: 13 }}>Members see each other's crossing legs only as "Member 2", "Member 3". Addresses stay private.</p>}
        </section>
      </div>
    </>
  );
}
