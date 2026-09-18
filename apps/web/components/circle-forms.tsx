"use client";

import { useActionState } from "react";
import { createCircleAction, inviteAction, joinCircleAction, type ActionState } from "@/lib/server/circle-actions";

const input = { height: 42, border: "1px solid var(--line)", borderRadius: 12, padding: "0 12px", background: "var(--paper)", width: "100%" } as const;

export function CreateCircleForm({ assets }: { assets: Array<{ uid: string; symbol: string }> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCircleAction, {});
  return (
    <form action={action} className="tile" style={{ padding: 24, display: "grid", gap: 14 }}>
      <p className="h3">Create a circle</p>
      <label style={{ display: "grid", gap: 6 }}>Name<input name="name" required style={input} placeholder="AI Stocks Circle" /></label>
      <label style={{ display: "grid", gap: 6 }}>Organizer wallet<input name="organizer" required className="num" style={input} placeholder="0x…" /></label>
      <div className="grid-2">
        <label style={{ display: "grid", gap: 6 }}>Visibility
          <select name="visibility" style={input} defaultValue="INVITE_ONLY"><option value="INVITE_ONLY">Invite only</option><option value="PRIVATE">Private</option><option value="PUBLIC">Public</option></select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>Privacy
          <select name="privacyMode" style={input} defaultValue="AGGREGATE_ONLY"><option value="AGGREGATE_ONLY">Aggregates only</option><option value="DELTAS_ONLY">Members see deltas</option></select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>Minimum participants<input name="minParticipants" type="number" min={2} defaultValue={3} style={input} /></label>
        <label style={{ display: "grid", gap: 6 }}>Round every (hours, 0 = manual)<input name="cadenceHours" type="number" min={0} defaultValue={24} style={input} /></label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
        <legend style={{ marginBottom: 8 }}>Asset universe</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {assets.map((a) => (
            <label key={a.uid} className="chip" style={{ cursor: "pointer" }}><input type="checkbox" name="assets" value={a.uid} defaultChecked={["NVDA", "AAPL", "MSFT", "GOOGL", "META"].includes(a.symbol)} /> {a.symbol}</label>
          ))}
        </div>
      </fieldset>
      {state.error && <p role="alert" className="badge badge-fail" style={{ justifySelf: "start", height: "auto", padding: "6px 12px" }}>{state.error}</p>}
      <button className="btn btn-primary" disabled={pending} style={{ justifySelf: "start" }}>{pending ? "Creating" : "Create circle"}</button>
    </form>
  );
}

export function JoinForm({ circleId, visibility }: { circleId: string; visibility: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(joinCircleAction, {});
  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="circleId" value={circleId} />
      <label style={{ display: "grid", gap: 6 }}>Wallet address<input name="address" required className="num" style={input} placeholder="0x…" /></label>
      {visibility === "INVITE_ONLY" && <label style={{ display: "grid", gap: 6 }}>Invite code<input name="invite" required style={input} /></label>}
      {visibility === "PRIVATE" && <label style={{ display: "grid", gap: 6 }}>Organizer adding this member<input name="addedBy" required className="num" style={input} placeholder="organizer 0x…" /></label>}
      {state.error && <p role="alert" className="muted">{state.error}</p>}
      <button className="btn btn-primary btn-sm" disabled={pending} style={{ justifySelf: "start" }}>{visibility === "PRIVATE" ? "Add member" : "Join circle"}</button>
    </form>
  );
}

export function InviteForm({ circleId }: { circleId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteAction, {});
  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="circleId" value={circleId} />
      <label style={{ display: "grid", gap: 6 }}>Organizer wallet<input name="organizer" required className="num" style={input} /></label>
      <button className="btn btn-secondary btn-sm" disabled={pending} style={{ justifySelf: "start" }}>Create single-use invite</button>
      {state.invite && <p>Invite code <span className="num" style={{ background: "var(--surface)", padding: "4px 8px", borderRadius: 8 }}>{state.invite}</span> <span className="faint">(only its hash is stored)</span></p>}
      {state.error && <p role="alert" className="muted">{state.error}</p>}
    </form>
  );
}
