"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { api } from "@/lib/json";
import { RESIDUAL_BEHAVIOR_WORDS, VISIBILITY_WORDS } from "@/lib/circle-words";
import type { Circle, CircleInput } from "@/lib/server/circles";
import p from "./product.module.css";

const DURATIONS = [{ sec: 300, label: "5 minutes" }, { sec: 900, label: "15 minutes" }, { sec: 3_600, label: "1 hour" }, { sec: 14_400, label: "4 hours" }, { sec: 86_400, label: "1 day" }];
const CADENCES = [{ sec: 0, label: "On demand" }, { sec: 86_400, label: "Daily" }, { sec: 604_800, label: "Weekly" }];

export function CreateCircleForm({ assets, suggested }: { assets: Array<{ uid: string; symbol: string }>; suggested: string[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<CircleInput["visibility"]>("PUBLIC");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(suggested.filter((u) => assets.some((a) => a.uid === u))));
  const [filter, setFilter] = useState("");
  const [cadenceSec, setCadenceSec] = useState(0);
  const [durationSec, setDurationSec] = useState(900);
  const [minParticipants, setMinParticipants] = useState(2);
  const [residual, setResidual] = useState<CircleInput["residualBehavior"]>("ECONOMIC");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = useMemo(() => {
    const q = filter.trim().toUpperCase();
    return assets.filter((a) => picked.has(a.uid) || !q || a.symbol.includes(q));
  }, [assets, filter, picked]);

  const toggle = (uid: string) => setPicked((s) => {
    const next = new Set(s);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    return next;
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      try {
        const input: CircleInput = { name, description, visibility, assetUids: [...picked], minParticipants, cadenceSec: cadenceSec || null, durationSec, residualBehavior: residual, privacyMode: "DELTAS_ONLY" };
        const { circle } = await api<{ circle: Circle }>("/api/circles", { body: input });
        router.push(`/circles/${circle.id}`);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  return (
    <form className={p.panel} onSubmit={submit} aria-labelledby="form-title">
      <h2 id="form-title" className="sr-only">Circle details</h2>
      <div className={p.fields}>
        <label className={p.field}>Name<input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={60} placeholder="Big Tech rebalancers" /></label>
        <label className={p.field}>Who can join
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as CircleInput["visibility"])}>
            {(Object.keys(VISIBILITY_WORDS) as Array<keyof typeof VISIBILITY_WORDS>).map((v) => <option key={v} value={v}>{VISIBILITY_WORDS[v]}</option>)}
          </select>
        </label>
      </div>
      <label className={p.field}>Description<textarea rows={2} value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} placeholder="Who this Circle is for and how often it crosses." /></label>

      <fieldset className={p.field} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ marginBottom: 6 }}>Stock Tokens this Circle crosses <span className="faint">({picked.size} picked, at least 2)</span></legend>
        <input aria-label="Filter Stock Tokens" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by ticker" />
        <div className={p.pick}>
          {shown.map((a) => (
            <label key={a.uid} className={picked.has(a.uid) ? p.pickOn : ""}>
              <input type="checkbox" className="sr-only" checked={picked.has(a.uid)} onChange={() => toggle(a.uid)} />
              {a.symbol}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={p.fields}>
        <label className={p.field}>How often rounds run
          <select value={cadenceSec} onChange={(e) => setCadenceSec(Number(e.target.value))}>{CADENCES.map((c) => <option key={c.sec} value={c.sec}>{c.label}</option>)}</select>
        </label>
        <label className={p.field}>How long each round collects
          <select value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))}>{DURATIONS.map((d) => <option key={d.sec} value={d.sec}>{d.label}</option>)}</select>
        </label>
        <label className={p.field}>Minimum people per round
          <input type="number" min={2} max={50} value={minParticipants} onChange={(e) => setMinParticipants(Number(e.target.value))} />
        </label>
        <label className={p.field}>What happens to leftovers
          <select value={residual} onChange={(e) => setResidual(e.target.value as CircleInput["residualBehavior"])}>
            {(Object.keys(RESIDUAL_BEHAVIOR_WORDS) as Array<keyof typeof RESIDUAL_BEHAVIOR_WORDS>).map((r) => <option key={r} value={r}>{RESIDUAL_BEHAVIOR_WORDS[r]}</option>)}
          </select>
        </label>
      </div>

      {error && <p className={p.error} role="alert">{error}</p>}
      <div className={p.actions}><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create Circle"}</button></div>
    </form>
  );
}
