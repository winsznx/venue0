/**
 * Route costs built only from measured live quotes (campaign/data/cost-curves.json).
 * Between measured sizes: linear interpolation of USD cost. Below the smallest size: the smallest size's USD cost
 * (fixed cost dominates). Above the largest size: the largest size's bps, flagged as extrapolated.
 * A size at or above a measured NoRouteFoundError is unavailable. A transient provider error point is skipped.
 */
export const COST_MODEL_VERSION = "venue0-cost-model-1";

type Point = {
  symbol: string;
  sizeUsd: number;
  side: "SELL" | "BUY";
  uniswap: { allInCostUsd?: number; gasFeeUsd?: number; error?: string };
  flash: { allInCostUsd?: number; feeUsd?: number; error?: string };
};

export type Venue = "UNISWAP" | "FLASH";

export type CostEstimate = { available: boolean; costUsd: number; fixedCostUsd: number; extrapolated: boolean; reason?: string };

type Curve = { sizes: number[]; costs: number[]; noRouteFrom: number; fixed: number };

export class CostModel {
  private readonly curves = new Map<string, Curve>();

  constructor(points: Point[]) {
    const groups = new Map<string, Point[]>();
    for (const p of points) {
      for (const venue of ["UNISWAP", "FLASH"] as const) {
        const key = `${venue}|${p.symbol}|${p.side}`;
        groups.set(key, [...(groups.get(key) ?? []), p]);
      }
    }
    for (const [key, group] of groups) {
      const venue = key.split("|")[0] as Venue;
      const sorted = [...group].sort((a, b) => a.sizeUsd - b.sizeUsd);
      const sizes: number[] = [];
      const costs: number[] = [];
      let noRouteFrom = Number.POSITIVE_INFINITY;
      const fixedSamples: number[] = [];
      for (const p of sorted) {
        const q = venue === "UNISWAP" ? p.uniswap : p.flash;
        if (q.allInCostUsd !== undefined) {
          sizes.push(p.sizeUsd);
          costs.push(q.allInCostUsd);
          if (venue === "UNISWAP" && p.uniswap.gasFeeUsd !== undefined) fixedSamples.push(p.uniswap.gasFeeUsd);
          if (venue === "FLASH" && p.flash.feeUsd !== undefined) fixedSamples.push(Math.max(0, p.flash.feeUsd - p.sizeUsd * 0.001));
        } else if (q.error && /NoRouteFoundError|UnsupportedTokenError/.test(q.error)) {
          noRouteFrom = Math.min(noRouteFrom, p.sizeUsd);
        }
      }
      fixedSamples.sort((a, b) => a - b);
      this.curves.set(key, { sizes, costs, noRouteFrom, fixed: fixedSamples[Math.floor(fixedSamples.length / 2)] ?? 0 });
    }
  }

  estimate(venue: Venue, symbol: string, side: "SELL" | "BUY", notionalUsd: number, stress: { multiplier: number; unavailableUniswap: string[] } = { multiplier: 1, unavailableUniswap: [] }): CostEstimate {
    const curve = this.curves.get(`${venue}|${symbol}|${side}`);
    const none = (reason: string): CostEstimate => ({ available: false, costUsd: 0, fixedCostUsd: 0, extrapolated: false, reason });
    if (!curve || curve.sizes.length === 0) return none("no measured quotes");
    if (venue === "UNISWAP" && stress.unavailableUniswap.includes(symbol)) return none("stress: route disabled");
    if (notionalUsd >= curve.noRouteFrom) return none(`NoRouteFoundError measured at $${curve.noRouteFrom}`);
    const { sizes, costs } = curve;
    let cost: number;
    let extrapolated = false;
    const last = sizes.length - 1;
    if (notionalUsd <= (sizes[0] as number)) cost = costs[0] as number;
    else if (notionalUsd >= (sizes[last] as number)) {
      cost = ((costs[last] as number) / (sizes[last] as number)) * notionalUsd;
      extrapolated = notionalUsd > (sizes[last] as number);
    } else {
      const i = sizes.findIndex((s) => s >= notionalUsd);
      const [s0, s1, c0, c1] = [sizes[i - 1] as number, sizes[i] as number, costs[i - 1] as number, costs[i] as number];
      cost = c0 + ((c1 - c0) * (notionalUsd - s0)) / (s1 - s0);
    }
    return { available: true, costUsd: cost * stress.multiplier, fixedCostUsd: curve.fixed * stress.multiplier, extrapolated };
  }
}
