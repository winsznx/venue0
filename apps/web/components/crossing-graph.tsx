"use client";

import { useEffect, useMemo, useState } from "react";
import type { Round } from "@/lib/data";
import { usd } from "@/lib/format";
import styles from "./crossing-graph.module.css";

export type GraphMode = "MARKET" | "PAIRWISE" | "VENUE0";

type Edge = { id: string; from: string; to: string; label: string; kind: "cross" | "external" };

const W = 830;
const H = 480;
const CX = 318;
const CY = 246;
const R = 182;
const NODE_W = 236;
const NODE_H = 86;
const VENUE = { x: 728, y: CY, w: 170, h: 130 };

function nodePositions(n: number) {
  // Two portfolios sit on a diagonal: opposite legs arc on either side and both have a clear path to the venue.
  if (n === 2) return [{ x: CX - 170, y: CY - 120 }, { x: CX + 90, y: CY + 120 }];
  return Array.from({ length: n }, (_, i) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
  });
}

/** Summary of what a participant wants, from its signed intent only. */
function wantsLine(p: Round["participants"][number]) {
  const sells = p.intent.filter((l) => l.side === "SELL").map((l) => l.symbol);
  const buys = p.intent.filter((l) => l.side === "BUY").map((l) => l.symbol);
  return `sells ${sells.join(", ") || "none"} · wants ${buys.join(", ") || "none"}`;
}

export function edgesFor(round: Round, mode: GraphMode): Edge[] {
  if (mode === "MARKET") {
    return round.participants.flatMap((p) => p.intent.map((l) => ({ id: `${p.address}-${l.symbol}-${l.side}`, from: p.address, to: "VENUE", label: `${l.side === "SELL" ? "sell" : "buy"} ${l.symbol}`, kind: "external" as const })));
  }
  const crossed: Edge[] =
    mode === "PAIRWISE"
      ? round.comparison.pairwise.transfers.map((t, i) => ({ id: `pw-${i}`, from: t.from, to: t.to, label: `${t.symbol} ${usd(t.valueUsd)}`, kind: "cross" as const }))
      : orderedLegs(round).map((l, i) => ({ id: `leg-${i}`, from: l.from, to: l.to, label: `${l.symbol} ${usd(l.valueUsd)}`, kind: "cross" as const }));

  // Residual edges: any requested value this mode leaves unmatched above dust ($0.10) goes to external liquidity.
  const matched = new Map<string, number>();
  const add = (owner: string, symbol: string, v: number) => matched.set(`${owner}|${symbol}`, (matched.get(`${owner}|${symbol}`) ?? 0) + v);
  if (mode === "PAIRWISE") for (const t of round.comparison.pairwise.transfers) { add(t.from, t.symbol, t.valueUsd); add(t.to, t.symbol, t.valueUsd); }
  else for (const l of round.legs) { add(l.from, l.symbol, l.valueUsd); add(l.to, l.symbol, l.valueUsd); }
  const residual: Edge[] = round.participants.flatMap((p) =>
    p.intent
      .filter((l) => l.valueUsd - (matched.get(`${p.address}|${l.symbol}`) ?? 0) >= 0.1)
      .map((l) => ({ id: `res-${p.address}-${l.symbol}`, from: p.address, to: "VENUE", label: `${l.side === "SELL" ? "sell" : "buy"} ${l.symbol} ${usd(l.valueUsd - (matched.get(`${p.address}|${l.symbol}`) ?? 0))}`, kind: "external" as const })),
  );
  return [...crossed, ...residual];
}

/** Draw legs in cycle order when a cycle exists, so the discovery reads A -> C -> B -> A. */
function orderedLegs(round: Round) {
  const cycle = round.cycles[0];
  if (!cycle) return round.legs;
  const ordered = cycle.map((h) => round.legs.find((l) => l.from === h.from && l.to === h.to && l.symbol === h.symbol)).filter((l): l is Round["legs"][number] => Boolean(l));
  return [...ordered, ...round.legs.filter((l) => !ordered.includes(l))];
}

function curve(a: { x: number; y: number }, b: { x: number; y: number }, bend: number) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * bend;
  const cy = my + (dx / len) * bend;
  return { d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`, lx: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, ly: 0.25 * a.y + 0.5 * cy + 0.25 * b.y };
}

/** Clip a centre-to-centre segment to the node rectangles so arrows start and end at card edges. */
function clipToRect(from: { x: number; y: number }, to: { x: number; y: number }, w: number, h: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const t = Math.min(Math.abs((w / 2 + 6) / (dx || 1e-9)), Math.abs((h / 2 + 6) / (dy || 1e-9)));
  return { x: from.x + dx * Math.min(t, 0.45), y: from.y + dy * Math.min(t, 0.45) };
}

export function CrossingGraph({ round, mode, animate = true, onSequenceEnd, caption }: { round: Round; mode: GraphMode; animate?: boolean; onSequenceEnd?: () => void; caption?: string }) {
  const positions = useMemo(() => nodePositions(round.participants.length), [round.participants.length]);
  const pos = (address: string) => {
    if (address === "VENUE") return { x: VENUE.x, y: VENUE.y };
    const i = round.participants.findIndex((p) => p.address === address);
    return positions[i] ?? { x: CX, y: CY };
  };
  const edges = useMemo(() => edgesFor(round, mode), [round, mode]);
  const crossEdges = edges.filter((e) => e.kind === "cross");
  const [revealed, setRevealed] = useState(animate ? 0 : edges.length);

  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduced) {
      setRevealed(edges.length);
      onSequenceEnd?.();
      return;
    }
    setRevealed(0);
    const timers = edges.map((_, i) => window.setTimeout(() => setRevealed(i + 1), 450 + i * (edges[i]?.kind === "cross" ? 650 : 220)));
    const done = window.setTimeout(() => onSequenceEnd?.(), 450 + edges.length * 650 + 300);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replay only when the round or mode changes
  }, [round.key, mode, animate]);

  const pairCount = new Map<string, number>();
  const externalIndex = new Map(
    edges
      .filter((e) => e.to === "VENUE")
      .map((e) => ({ e, y: pos(e.from).y }))
      .sort((p, q) => p.y - q.y)
      .map(({ e }, i) => [e.id, i] as const),
  );
  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-labelledby={`graph-title-${round.key}`}>
        <title id={`graph-title-${round.key}`}>{caption ?? `Crossing graph for ${round.gate}`}</title>
        <defs>
          <marker id="arrow-cross" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--cross)" />
          </marker>
          <marker id="arrow-ext" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--residual)" />
          </marker>
        </defs>

        <g className={styles.venue}>
          <rect x={VENUE.x - VENUE.w / 2} y={VENUE.y - VENUE.h / 2} width={VENUE.w} height={VENUE.h} rx={18} />
          <text x={VENUE.x} y={VENUE.y - 12} textAnchor="middle" className={styles.venueTitle}>Public liquidity</text>
          <text x={VENUE.x} y={VENUE.y + 12} textAnchor="middle" className={styles.venueSub}>Uniswap · Flash</text>
          <text x={VENUE.x} y={VENUE.y + 36} textAnchor="middle" className={styles.venueCount}>
            {edges.filter((e, i) => e.kind === "external" && i < revealed).length} orders
          </text>
        </g>

        {edges.map((e, i) => {
          const a = pos(e.from);
          const b = pos(e.to);
          const key = [e.from, e.to].sort().join("|");
          const nth = pairCount.get(key) ?? 0;
          pairCount.set(key, nth + 1);
          const external = e.to === "VENUE";
          const extIndex = external ? externalIndex.get(e.id) ?? 0 : 0;
          const extTotal = Math.max(1, edges.filter((x) => x.to === "VENUE").length);
          // External orders fan out: each one gets its own arc and its own landing point on the venue, so every order is countable.
          const bend = e.kind === "cross" ? (round.participants.length === 2 ? 64 : 38) + nth * 26 : -(14 + nth * 22);
          const start = external ? { x: a.x + NODE_W / 2 - 18, y: a.y + (nth - 0.5) * 14 } : clipToRect(a, b, NODE_W, NODE_H);
          const end = external ? { x: VENUE.x - VENUE.w / 2 - 4, y: VENUE.y - VENUE.h / 2 + 18 + ((VENUE.h - 36) * (extIndex + 0.5)) / extTotal } : clipToRect(b, a, NODE_W, NODE_H);
          const c = curve(start, end, bend);
          const shown = i < revealed;
          return (
            <g key={e.id} className={`${styles.edge} ${e.kind === "cross" ? styles.cross : styles.external} ${shown ? styles.shown : ""}`}>
              <path d={c.d} pathLength={1} markerEnd={`url(#${e.kind === "cross" ? "arrow-cross" : "arrow-ext"})`} className={styles.path} />
              {e.kind === "cross" && <path d={c.d} pathLength={1} className={styles.flow} />}
              {e.kind === "cross" && (
                <g className={styles.labelGroup} transform={`translate(${c.lx} ${c.ly})`}>
                  <rect x={-64} y={-15} width={128} height={30} rx={15} />
                  <text textAnchor="middle" y={5}>{e.label}</text>
                </g>
              )}
            </g>
          );
        })}

        {round.participants.map((p, i) => {
          const at = positions[i] as { x: number; y: number };
          return (
            <g key={p.address} className={styles.node} transform={`translate(${at.x - NODE_W / 2} ${at.y - NODE_H / 2})`}>
              <rect width={NODE_W} height={NODE_H} rx={18} />
              <text x={20} y={34} className={styles.nodeTitle}>{p.label}</text>
              <text x={20} y={62} className={styles.nodeSub}>{wantsLine(p)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        {mode === "MARKET" ? "Market only: every order goes to public liquidity." : mode === "PAIRWISE" ? "Pairwise matching:" : "Venue0 crossing:"}{" "}
        {crossEdges.map((e) => `${round.participants.find((p) => p.address === e.from)?.label} sends ${e.label} to ${round.participants.find((p) => p.address === e.to)?.label}.`).join(" ")}{" "}
        {edges.filter((e) => e.kind === "external").length} orders go to public liquidity.
      </figcaption>
    </figure>
  );
}
