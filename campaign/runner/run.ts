import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { SOLVER_VERSION } from "@venue0/matcher";
import { RESIDUAL_ENGINE_VERSION } from "@venue0/residual";
import { canonicalJson, type AssetUid } from "@venue0/shared";
import type { Address } from "viem";
import { COHORT_NATURE, COHORTS, GENERATOR_VERSION, generateScenario, type Cohort, type UniverseAsset } from "../scenarios/generate.ts";
import { ARMS, evaluateScenario, frozenSnapshot, type Arm, type ArmRow } from "./arms.ts";
import { COST_MODEL_VERSION, CostModel } from "./cost-model.ts";

/**
 * Usage:
 *   tsx campaign/runner/run.ts --frozen          run the frozen campaign from campaign/manifest.json -> campaign/results/
 *   tsx campaign/runner/run.ts --smoke           2 scenarios per cohort, seed "smoke", -> campaign/smoke/ (code check only)
 */
const frozen = process.argv.includes("--frozen");
if (!frozen && !process.argv.includes("--smoke")) throw new Error("pass --frozen or --smoke");

type Manifest = { seed: string; scenariosPerCohort: number; cohorts: Cohort[]; versions: Record<string, string>; inputs: Record<string, string> };
const sha256 = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");

const manifest = JSON.parse(await readFile("campaign/manifest.json", "utf8")) as Manifest;
const seed = frozen ? manifest.seed : "smoke";
const perCohort = frozen ? manifest.scenariosPerCohort : 2;
const outDir = frozen ? "campaign/results" : "campaign/smoke";

if (frozen) {
  const expected: Record<string, string> = {
    generator: GENERATOR_VERSION,
    matcher: SOLVER_VERSION,
    residualEngine: RESIDUAL_ENGINE_VERSION,
    costModel: COST_MODEL_VERSION,
  };
  for (const [k, v] of Object.entries(expected)) if (manifest.versions[k] !== v) throw new Error(`manifest ${k} ${manifest.versions[k]} != code ${v}; methodology changed after freeze`);
  for (const [path, hash] of Object.entries(manifest.inputs)) if ((await sha256(path)) !== hash) throw new Error(`${path} changed after freeze`);
}

const prices = JSON.parse(await readFile("campaign/data/price-snapshot.json", "utf8")) as { capturedAt: string; assets: Array<{ symbol: string; uid: string; token: string; priceUsdE18: string }> };
const universe: UniverseAsset[] = prices.assets.map((a) => ({ symbol: a.symbol, uid: a.uid as AssetUid, token: a.token as Address, priceUsdE18: BigInt(a.priceUsdE18) }));
const curves = JSON.parse(await readFile("campaign/data/cost-curves.json", "utf8")) as { points: ConstructorParameters<typeof CostModel>[0] };
const costs = new CostModel(curves.points);
const capturedAt = Math.floor(Date.parse(prices.capturedAt) / 1000);
const snapshot = frozenSnapshot(universe, capturedAt);
const nowSec = capturedAt + 60;
const symbols = universe.map((a) => a.symbol);

const rows: ArmRow[] = [];
const failures: Array<{ scenario: string; error: string }> = [];
for (const cohort of manifest.cohorts) {
  for (let i = 0; i < perCohort; i++) {
    const scenario = generateScenario(seed, cohort, i, symbols);
    try {
      rows.push(...(await evaluateScenario(scenario, universe, snapshot, nowSec, costs)));
    } catch (error) {
      failures.push({ scenario: scenario.id, error: (error as Error).message.slice(0, 300) });
    }
  }
  console.log(`${cohort}: ${rows.filter((r) => r.cohort === cohort).length / ARMS.length} scenarios`);
}

// ---------------------------------------------------------------- aggregation

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
};
const r4 = (x: number | null) => (x === null ? null : Math.round(x * 10_000) / 10_000);

function armStats(subset: ArmRow[], arm: Arm) {
  const rs = subset.filter((r) => r.arm === arm);
  const requested = sum(rs.map((r) => r.requested_notional));
  const crossed = sum(rs.map((r) => r.crossed_notional));
  const executed = sum(rs.map((r) => r.external_notional_executed));
  const cost = sum(rs.map((r) => r.est_external_cost_usd));
  return {
    scenarios: rs.length,
    requested_notional: r4(requested),
    crossed_notional: r4(crossed),
    cross_rate_pooled: r4(requested > 0 ? crossed / requested : 0),
    cross_rate_median: r4(quantile(rs.map((r) => r.cross_rate), 0.5)),
    cross_rate_p10: r4(quantile(rs.map((r) => r.cross_rate), 0.1)),
    cross_rate_p90: r4(quantile(rs.map((r) => r.cross_rate), 0.9)),
    residual_notional: r4(sum(rs.map((r) => r.residual_notional))),
    external_orders: sum(rs.map((r) => r.external_order_count)),
    external_notional_executed: r4(executed),
    unfilled_notional: r4(sum(rs.map((r) => r.unfilled_notional))),
    deferred_notional: r4(sum(rs.map((r) => r.deferred_notional))),
    cancelled_notional: r4(sum(rs.map((r) => r.cancelled_notional))),
    est_external_cost_usd: r4(cost),
    est_external_cost_bps_on_executed: executed > 0 ? Math.round((cost / executed) * 10_000) : null,
    zero_cross_scenarios: rs.filter((r) => r.crossed_notional === 0).length,
  };
}

function upliftStats(subset: ArmRow[]) {
  const rs = subset.filter((r) => r.arm === "VENUE0_CROSSING");
  const bilateral = sum(rs.map((r) => r.bilateral_crossed_notional));
  const venue0 = sum(rs.map((r) => r.venue0_crossed_notional));
  const requested = sum(rs.map((r) => r.requested_notional));
  return {
    bilateral_crossed_notional: r4(bilateral),
    venue0_crossed_notional: r4(venue0),
    multi_party_uplift_usd: r4(venue0 - bilateral),
    multi_party_uplift_pct_of_bilateral: bilateral > 0 ? r4((venue0 - bilateral) / bilateral) : null,
    multi_party_uplift_pct_of_requested: requested > 0 ? r4((venue0 - bilateral) / requested) : null,
    scenarios_with_uplift: rs.filter((r) => r.multi_party_uplift > 0.01).length,
    scenarios_where_bilateral_captures_99pct: rs.filter((r) => r.venue0_crossed_notional > 0 && r.bilateral_crossed_notional >= 0.99 * r.venue0_crossed_notional).length,
    scenarios_where_bilateral_exceeds_venue0: rs.filter((r) => r.bilateral_crossed_notional > r.venue0_crossed_notional + 0.02).length,
  };
}

const cohortSummaries = Object.fromEntries(
  COHORTS.map((c) => {
    const subset = rows.filter((r) => r.cohort === c);
    return [c, { nature: COHORT_NATURE[c], arms: Object.fromEntries(ARMS.map((a) => [a, armStats(subset, a)])), uplift: upliftStats(subset) }];
  }),
);

const venue0Rows = rows.filter((r) => r.arm === "VENUE0_CROSSING");
const bucket = <T extends string | number>(label: (r: ArmRow) => T, subset = venue0Rows) => {
  const groups = new Map<T, ArmRow[]>();
  for (const r of subset) groups.set(label(r), [...(groups.get(label(r)) ?? []), r]);
  return Object.fromEntries(
    [...groups].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, rs]) => {
      const req = sum(rs.map((r) => r.requested_notional));
      return [String(k), {
        scenarios: rs.length,
        venue0_cross_rate_pooled: r4(req ? sum(rs.map((r) => r.venue0_crossed_notional)) / req : 0),
        bilateral_cross_rate_pooled: r4(req ? sum(rs.map((r) => r.bilateral_crossed_notional)) / req : 0),
        uplift_pct_of_requested: r4(req ? sum(rs.map((r) => r.multi_party_uplift)) / req : 0),
      }];
    }),
  );
};
const natural = venue0Rows.filter((r) => r.nature === "natural/randomized");
const fullRows = rows.filter((r) => r.arm === "VENUE0_FULL");
const decisionTotals: Record<string, number> = {};
for (const r of fullRows) for (const part of r.residual_decisions.split(" ").filter(Boolean)) {
  const [k, v] = part.split(":");
  decisionTotals[k as string] = (decisionTotals[k as string] ?? 0) + Number(v);
}

const latencies = venue0Rows.map((r) => r.solver_latency_ms);
const summary = {
  seed,
  scenarios: rows.length / ARMS.length,
  failures,
  parity: {
    exact_pass: venue0Rows.filter((r) => r.reference_matcher_parity === "EXACT_PASS").length,
    lp_pass: venue0Rows.filter((r) => r.reference_matcher_parity === "LP_PASS").length,
    fail: venue0Rows.filter((r) => r.reference_matcher_parity.includes("FAIL")).map((r) => `${r.scenario_id}:${r.reference_matcher_parity}`),
  },
  overall: { arms: Object.fromEntries(ARMS.map((a) => [a, armStats(rows, a)])), uplift: upliftStats(rows) },
  natural_randomized_only: { arms: Object.fromEntries(ARMS.map((a) => [a, armStats(rows.filter((r) => r.nature === "natural/randomized"), a)])), uplift: upliftStats(rows.filter((r) => r.nature === "natural/randomized")) },
  cohorts: cohortSummaries,
  by_participant_count_natural: bucket((r) => String(r.participants).padStart(2, "0"), natural),
  by_complementarity_all: bucket((r) => (Math.min(0.9, Math.floor(r.complementarity * 10) / 10)).toFixed(1)),
  residual_decisions_venue0_full: decisionTotals,
  solver_latency_ms: { p50: quantile(latencies, 0.5), p95: quantile(latencies, 0.95), max: quantile(latencies, 1) },
  allocation_error_bps_value_weighted_mean: Object.fromEntries(
    ARMS.map((a) => {
      const rs = rows.filter((r) => r.arm === a);
      return [a, { before: r4(sum(rs.map((r) => r.allocation_error_before_bps)) / (rs.length || 1)), after_crossing: a === "MARKET_ONLY" ? null : r4(sum(rs.map((r) => r.allocation_error_after_bps ?? 0)) / (rs.length || 1)) }];
    }),
  ),
};

await mkdir(outDir, { recursive: true });
const columns = Object.keys(rows[0] ?? {}) as Array<keyof ArmRow>;
const csv = [columns.join(","), ...rows.map((r) => columns.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
await writeFile(`${outDir}/results.csv`, `${csv}\n`);
await writeFile(`${outDir}/results.json`, `${canonicalJson(rows, 1)}\n`);
await writeFile(`${outDir}/summary.json`, `${canonicalJson({ ...summary, generatedAt: new Date().toISOString(), sourceRevision: execSync("git rev-parse HEAD").toString().trim() }, 2)}\n`);
console.log(`scenarios ${summary.scenarios}, failures ${failures.length}, parity fail ${summary.parity.fail.length} -> ${outDir}`);
