/**
 * Min-cost circulation by minimum-mean cycle canceling (Goldberg-Tarjan), using Karp's algorithm to find the
 * minimum mean cycle. The number of cancellations is bounded independently of capacity size, so the solver
 * terminates quickly even when capacities are large integers. Iteration order is fixed, making output deterministic.
 */

export type CirculationEdge = {
  from: number;
  to: number;
  capacity: bigint;
  cost: number;
};

type Arc = { edge: number; forward: boolean; from: number; to: number; cost: number };

export class CirculationError extends Error {}

const MAX_CANCELLATIONS = 1_000_000;

export function minCostCirculation(nodeCount: number, edges: readonly CirculationEdge[]): bigint[] {
  for (const [i, e] of edges.entries()) {
    if (e.capacity < 0n) throw new CirculationError(`edge ${i} has negative capacity`);
    if (!Number.isInteger(e.cost)) throw new CirculationError(`edge ${i} cost must be an integer`);
    if (e.from < 0 || e.from >= nodeCount || e.to < 0 || e.to >= nodeCount) throw new CirculationError(`edge ${i} endpoint out of range`);
  }

  const flow = edges.map(() => 0n);
  for (let iteration = 0; iteration < MAX_CANCELLATIONS; iteration++) {
    const arcs = residualArcs(edges, flow);
    const cycle = minimumMeanCycle(nodeCount, arcs);
    if (!cycle) return flow;

    let bottleneck: bigint | undefined;
    for (const arc of cycle) {
      const residual = arc.forward ? (edges[arc.edge] as CirculationEdge).capacity - (flow[arc.edge] as bigint) : (flow[arc.edge] as bigint);
      if (bottleneck === undefined || residual < bottleneck) bottleneck = residual;
    }
    if (bottleneck === undefined || bottleneck <= 0n) throw new CirculationError("negative cycle with no residual capacity");
    for (const arc of cycle) {
      flow[arc.edge] = (flow[arc.edge] as bigint) + (arc.forward ? bottleneck : -bottleneck);
    }
  }
  throw new CirculationError(`no convergence after ${MAX_CANCELLATIONS} cancellations`);
}

function residualArcs(edges: readonly CirculationEdge[], flow: readonly bigint[]): Arc[] {
  const arcs: Arc[] = [];
  edges.forEach((e, i) => {
    const f = flow[i] as bigint;
    if (f < e.capacity) arcs.push({ edge: i, forward: true, from: e.from, to: e.to, cost: e.cost });
    if (f > 0n) arcs.push({ edge: i, forward: false, from: e.to, to: e.from, cost: -e.cost });
  });
  return arcs;
}

/** Returns a negative minimum-mean cycle as arcs in traversal order, or undefined if every cycle has mean >= 0. */
function minimumMeanCycle(nodeCount: number, arcs: readonly Arc[]): Arc[] | undefined {
  // Karp with an implicit super-source: level 0 distances are 0 for every node.
  const levels = nodeCount;
  const dist: number[][] = [new Array<number>(nodeCount).fill(0)];
  const parent: Array<Array<number>> = [new Array<number>(nodeCount).fill(-1)];

  for (let k = 1; k <= levels; k++) {
    const prev = dist[k - 1] as number[];
    const row = new Array<number>(nodeCount).fill(Number.POSITIVE_INFINITY);
    const parentRow = new Array<number>(nodeCount).fill(-1);
    arcs.forEach((arc, index) => {
      const base = prev[arc.from] as number;
      if (base === Number.POSITIVE_INFINITY) return;
      const candidate = base + arc.cost;
      if (candidate < (row[arc.to] as number)) {
        row[arc.to] = candidate;
        parentRow[arc.to] = index;
      }
    });
    dist.push(row);
    parent.push(parentRow);
  }

  // Minimize over v of max over k of (D_n(v) - D_k(v)) / (n - k), compared as exact fractions.
  let best: { v: number; num: number; den: number } | undefined;
  const last = dist[levels] as number[];
  for (let v = 0; v < nodeCount; v++) {
    const dn = last[v] as number;
    if (dn === Number.POSITIVE_INFINITY) continue;
    let worst: { num: number; den: number } | undefined;
    for (let k = 0; k < levels; k++) {
      const dk = (dist[k] as number[])[v] as number;
      if (dk === Number.POSITIVE_INFINITY) continue;
      const candidate = { num: dn - dk, den: levels - k };
      if (!worst || candidate.num * worst.den > worst.num * candidate.den) worst = candidate;
    }
    if (worst && (!best || worst.num * best.den < best.num * worst.den)) best = { v, ...worst };
  }
  if (!best || best.num >= 0) return undefined;

  // Walk parents back from level n; the walk contains a cycle whose mean equals the minimum.
  const walk: Arc[] = [];
  let node = best.v;
  for (let k = levels; k >= 1; k--) {
    const arcIndex = (parent[k] as number[])[node] as number;
    const arc = arcs[arcIndex] as Arc;
    walk.push(arc);
    node = arc.from;
  }
  walk.reverse();

  let chosen: Arc[] | undefined;
  let chosenCost = 0;
  const stackVertices = [(walk[0] as Arc).from];
  const stackArcs: Arc[] = [];
  const position = new Map<number, number>([[stackVertices[0] as number, 0]]);
  for (const arc of walk) {
    const at = position.get(arc.to);
    if (at === undefined) {
      stackArcs.push(arc);
      stackVertices.push(arc.to);
      position.set(arc.to, stackVertices.length - 1);
      continue;
    }
    const cycle = [...stackArcs.splice(at), arc];
    for (const removed of stackVertices.splice(at + 1)) position.delete(removed);
    const cost = cycle.reduce((sum, a) => sum + a.cost, 0);
    if (!chosen || cost * chosen.length < chosenCost * cycle.length) {
      chosen = cycle;
      chosenCost = cost;
    }
  }
  if (!chosen || chosenCost >= 0) throw new CirculationError("Karp walk did not yield a negative cycle");
  return chosen;
}
