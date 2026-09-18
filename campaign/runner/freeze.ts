import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { SOLVER_VERSION } from "@venue0/matcher";
import { RESIDUAL_ENGINE_VERSION } from "@venue0/residual";
import { COHORT_NATURE, COHORTS, GENERATOR_VERSION } from "../scenarios/generate.ts";
import { COST_MODEL_VERSION } from "./cost-model.ts";

/** Writes campaign/manifest.json. Run once, commit, then run the campaign with --frozen. */
const SEED = "venue0-campaign-2026-09-18-frozen";
const SCENARIOS_PER_COHORT = 40;
const INPUTS = ["campaign/data/price-snapshot.json", "campaign/data/cost-curves.json"];

const sha256 = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");
const manifest = {
  seed: SEED,
  scenariosPerCohort: SCENARIOS_PER_COHORT,
  totalScenarios: SCENARIOS_PER_COHORT * COHORTS.length,
  cohorts: COHORTS,
  cohortNature: COHORT_NATURE,
  arms: ["MARKET_ONLY", "BILATERAL_ONLY", "VENUE0_CROSSING", "VENUE0_FULL"],
  versions: { generator: GENERATOR_VERSION, matcher: SOLVER_VERSION, referenceMatcher: "exact-rational-simplex-bland-1 (<=6 participants) + highs-1.15.3 portfolio LP (>6)", bilateralBaseline: "highs-1.15.3 pairwise-balanced LP", residualEngine: RESIDUAL_ENGINE_VERSION, costModel: COST_MODEL_VERSION },
  inputs: Object.fromEntries(await Promise.all(INPUTS.map(async (p) => [p, await sha256(p)] as const))),
  frozenAt: new Date().toISOString(),
};
await writeFile("campaign/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest frozen: ${manifest.totalScenarios} scenarios, seed ${SEED}`);
