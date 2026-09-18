import { notFound } from "next/navigation";
import type { Hex } from "viem";
import { InviteForm, JoinForm } from "@/components/circle-forms";
import { assetChoices, circles } from "@/lib/server/circles";
import { short } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [svc, assets] = await Promise.all([circles(), assetChoices()]);
  let circle;
  try {
    circle = svc.getCircle(id as Hex);
  } catch {
    notFound();
  }
  const symbol = new Map(assets.map((a) => [a.uid, a.symbol]));
  const members = svc.listMembers(circle.id, circle.organizer);
  const count = Array.isArray(members) ? members.length : members.count;
  const next = svc.nextRoundWindow(circle.id);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{circle.name}</h1>
          <p className="muted" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            <span className="badge badge-neutral">{circle.visibility.replace("_", " ").toLowerCase()}</span>
            <span className="badge badge-neutral">{circle.privacyMode === "AGGREGATE_ONLY" ? "aggregates only" : "members see deltas"}</span>
            <span>{count} member{count === 1 ? "" : "s"}</span>
            <span>organizer <span className="num">{short(circle.organizer)}</span></span>
          </p>
        </div>
      </header>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <section className="tile" style={{ padding: 24, display: "grid", gap: 12 }}>
            <p className="h3">Asset universe</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{circle.allowedAssetUids.map((u) => <span key={u} className="chip">{symbol.get(u) ?? short(u)}</span>)}</div>
            <p className="muted">Intents outside this universe are rejected. Every asset is a canonical Stock Token with a Chainlink feed.</p>
          </section>
          <section className="tile" style={{ padding: 24, display: "grid", gap: 8 }}>
            <p className="h3">Next round</p>
            {next ? <p><span className="num">{new Date(next.opensAt * 1000).toISOString().replace("T", " ").slice(0, 16)}</span> UTC, collecting for {circle.defaultRoundDurationSec / 60} minutes</p> : <p className="muted">Rounds are opened manually by the organizer.</p>}
            <p className="muted">A round needs at least {circle.minParticipants} signed intents. Members submit intents from their own wallets; the round then runs the production matcher.</p>
          </section>
          <section className="tile" style={{ padding: 24, display: "grid", gap: 8 }}>
            <p className="h3">Previous rounds</p>
            <p className="muted">No rounds have run in this circle yet. Round results appear here as privacy-safe aggregates; per-asset figures stay hidden when fewer than 3 members touched an asset.</p>
          </section>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <section className="card" style={{ padding: 24, display: "grid", gap: 12 }}>
            <p className="h3">{circle.visibility === "PRIVATE" ? "Add a member" : "Join"}</p>
            <JoinForm circleId={circle.id} visibility={circle.visibility} />
            <p className="faint" style={{ fontSize: 13 }}>Membership is address-based in this build; wallet sign-in arrives with wallet connection.</p>
          </section>
          {circle.visibility === "INVITE_ONLY" && (
            <section className="card" style={{ padding: 24, display: "grid", gap: 12 }}>
              <p className="h3">Invite</p>
              <InviteForm circleId={circle.id} />
            </section>
          )}
          <section className="tile" style={{ padding: 24, display: "grid", gap: 8 }}>
            <p className="h3">Members</p>
            {circle.privacyMode === "AGGREGATE_ONLY" ? <p className="muted">This circle shows members a count only: {count}.</p> : Array.isArray(members) && members.map((m) => <p key={m.address} className="num" style={{ fontSize: 14 }}>{short(m.address)} <span className="faint">{m.role.toLowerCase()}</span></p>)}
          </section>
        </div>
      </div>
    </>
  );
}
