"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/json";
import p from "./product.module.css";

/** Join, invite, and the way into this Circle's round lobby. */
export function CircleActions({ circleId, role, visibility, invite }: { circleId: string; role: "ORGANIZER" | "MEMBER" | null; visibility: string; invite: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState(invite ?? "");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) => start(async () => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  });

  if (!role) {
    return (
      <section className={p.panel} aria-labelledby="join-title">
        <h2 id="join-title" className="h3">Join this Circle</h2>
        <p className="muted">Members can sign into any of its rounds. Joining doesn't move any tokens.</p>
        {visibility === "INVITE_ONLY" && <label className={p.field}>Invite code<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the code from your invite link" /></label>}
        {error && <p className={p.error} role="alert">{error}</p>}
        <div className={p.actions}>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(async () => { await api(`/api/circles/${circleId}/join`, { body: { invite: code } }); router.refresh(); })}>{pending ? "Joining…" : "Join Circle"}</button>
        </div>
      </section>
    );
  }

  return (
    <section className={p.youCard} aria-labelledby="enter-title">
      <h2 id="enter-title" className="h3">You're a {role === "ORGANIZER" ? "organizer" : "member"}</h2>
      <p>Enter the round lobby to sign your rebalance into the current round. If no round is running, one opens now with a fresh price snapshot.</p>
      {error && <p className={p.error} role="alert">{error}</p>}
      <div className={p.actions}>
        <button type="button" className="btn" style={{ background: "#fff", color: "#000" }} disabled={pending} onClick={() => run(async () => { const { roundId } = await api<{ roundId: string }>(`/api/circles/${circleId}/round`, { method: "POST" }); router.push(`/round/${roundId}/lobby`); })}>{pending ? "Opening…" : "Enter round lobby"}</button>
        {role === "ORGANIZER" && visibility !== "PRIVATE" && (
          <button type="button" className={`btn ${""}`} style={{ background: "transparent", color: "#fff", border: "1px solid #55575c" }} disabled={pending} onClick={() => run(async () => { const { code: c } = await api<{ code: string }>(`/api/circles/${circleId}/invite`, { method: "POST" }); setLink(`${window.location.origin}/circles/${circleId}?invite=${c}`); setCopied(false); })}>Create invite link</button>
        )}
      </div>
      {link && (
        <div className={p.field} style={{ color: "#c9ccd2" }}>
          Single-use invite link
          <div className={p.actions}>
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1 }} aria-label="Invite link" />
            <button type="button" className="btn btn-sm" style={{ background: "#fff", color: "#000" }} onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
