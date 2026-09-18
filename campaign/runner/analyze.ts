import { readFile, writeFile } from "node:fs/promises";
import { canonicalJson } from "@venue0/shared";
import type { ArmRow } from "./arms.ts";
import { CostModel } from "./cost-model.ts";

/**
 * Post-hoc analysis over the frozen results. Adds breakdowns; never changes a frozen metric or re-runs scenarios.
 * Output: campaign/results/analysis.json
 */
const rows = JSON.parse(await readFile("campaign/results/results.json", "utf8")) as ArmRow[];
const curves = JSON.parse(await readFile("campaign/data/cost-curves.json", "utf8")) as { points: ConstructorParameters<typeof CostModel>[0] };
const costs = new CostModel(curves.points);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (x: number) => Math.round(x * 10_000) / 100;
const c = rows.filter((r) => r.arm === "VENUE0_CROSSING");
const pooled = (rs: ArmRow[], field: "venue0_crossed_notional" | "bilateral_crossed_notional") => pct(sum(rs.map((r) => r[field])) / sum(rs.map((r) => r.requested_notional)));
const quantiles = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => pct(s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0);
  return { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) };
};

const naturalNoSkew = c.filter((r) => r.nature === "natural/randomized" && r.cohort !== "SIZE_SKEW");
const upliftShare = c.filter((r) => r.requested_notional > 0).map((r) => r.multi_party_uplift / r.requested_notional);

const sizes = [1, 2, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1_000, 2_000, 5_000, 10_000];
const symbols = [...new Set(curves.points.map((p) => p.symbol))];
const flashBreakEven = symbols.flatMap((symbol) =>
  (["SELL", "BUY"] as const).map((side) => {
    const bps = (venue: "UNISWAP" | "FLASH", n: number) => {
      const e = costs.estimate(venue, symbol, side, n);
      return e.available ? (e.costUsd / n) * 10_000 : Number.POSITIVE_INFINITY;
    };
    return {
      symbol,
      side,
      flashWithin50BpsFromUsd: sizes.find((n) => bps("FLASH", n) <= 50) ?? null,
      flashCheaperThanUniswapFromUsd: sizes.find((n) => bps("FLASH", n) < bps("UNISWAP", n)) ?? null,
      flashBpsAt: Object.fromEntries([1, 10, 100, 1_000].map((n) => [n, Math.round(bps("FLASH", n))])),
      uniswapBpsAt: Object.fromEntries([1, 10, 100, 1_000].map((n) => [n, Math.round(bps("UNISWAP", n))])),
    };
  }),
);

const analysis = {
  note: "Derived from campaign/results/results.json after the frozen run. Breakdowns only; no frozen metric changed.",
  natural_excluding_size_skew: { scenarios: naturalNoSkew.length, venue0_cross_rate_pooled_pct: pooled(naturalNoSkew, "venue0_crossed_notional"), bilateral_cross_rate_pooled_pct: pooled(naturalNoSkew, "bilateral_crossed_notional"), venue0_cross_rate_per_scenario_pct: quantiles(naturalNoSkew.map((r) => r.cross_rate)) },
  uplift_share_of_requested_per_scenario_pct: { all: quantiles(upliftShare), natural: quantiles(c.filter((r) => r.nature === "natural/randomized").map((r) => r.multi_party_uplift / r.requested_notional)) },
  scenarios_where_multiparty_adds_over_1pct_of_requested: { all: c.filter((r) => r.multi_party_uplift / r.requested_notional > 0.01).length, natural: c.filter((r) => r.nature === "natural/randomized" && r.multi_party_uplift / r.requested_notional > 0.01).length, of: { all: c.length, natural: c.filter((r) => r.nature === "natural/randomized").length } },
  scenarios_with_crossing_but_no_multiparty_gain: c.filter((r) => r.venue0_crossed_notional > 0 && r.multi_party_uplift <= 0.01).length,
  flash_break_even_from_measured_curves: flashBreakEven,
};
await writeFile("campaign/results/analysis.json", `${canonicalJson(analysis, 2)}\n`);
console.log(JSON.stringify({ ...analysis, flash_break_even_from_measured_curves: flashBreakEven.map((f) => `${f.symbol} ${f.side} <=50bps from $${f.flashWithin50BpsFromUsd}, beats Uniswap from $${f.flashCheaperThanUniswapFromUsd}`) }, null, 1));
