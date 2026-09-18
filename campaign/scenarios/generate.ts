import { keccak256, stringToHex, type Address } from "viem";
import { E18, type AssetUid, type Hex } from "@venue0/shared";

export const GENERATOR_VERSION = "venue0-campaign-gen-1";

export type Cohort =
  | "RANDOM_INDEPENDENT"
  | "THEME_CIRCLE"
  | "INDEX_REBALANCE"
  | "CONCENTRATED_TECH"
  | "HIGH_COMPLEMENTARITY"
  | "LOW_COMPLEMENTARITY"
  | "ZERO_OVERLAP"
  | "SIZE_SKEW"
  | "PARTIAL_MATCH"
  | "EXTERNAL_ROUTE_STRESS";

export type CohortNature = "natural/randomized" | "stress/control" | "constructed-positive";

export const COHORT_NATURE: Record<Cohort, CohortNature> = {
  RANDOM_INDEPENDENT: "natural/randomized",
  THEME_CIRCLE: "natural/randomized",
  INDEX_REBALANCE: "natural/randomized",
  CONCENTRATED_TECH: "natural/randomized",
  HIGH_COMPLEMENTARITY: "constructed-positive",
  LOW_COMPLEMENTARITY: "stress/control",
  ZERO_OVERLAP: "stress/control",
  SIZE_SKEW: "natural/randomized",
  PARTIAL_MATCH: "constructed-positive",
  EXTERNAL_ROUTE_STRESS: "stress/control",
};

export const COHORTS = Object.keys(COHORT_NATURE) as Cohort[];

export type UniverseAsset = { symbol: string; uid: AssetUid; token: Address; priceUsdE18: bigint };

/** A participant's starting holdings and target, both in USD, before conversion to raw units. */
export type ParticipantDraft = { owner: Address; holdingsUsd: Record<string, number>; targetUsd: Record<string, number>; restrictMarket: boolean };

export type Scenario = {
  id: string;
  cohort: Cohort;
  nature: CohortNature;
  seed: Hex;
  participants: ParticipantDraft[];
  /** Stress knobs applied to the measured cost model, only in EXTERNAL_ROUTE_STRESS. */
  costMultiplier: number;
  unavailableUniswap: string[];
};

/** mulberry32 seeded from a 32-bit slice of keccak(masterSeed:cohort:index). */
function rng(seed: Hex): () => number {
  let a = Number.parseInt(seed.slice(2, 10), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = ReturnType<typeof rng>;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
function sample<T>(r: Rand, xs: readonly T[], k: number): T[] {
  const copy = [...xs];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy.slice(0, k);
}
/** Random weights summing to 1 (normalized exponentials, i.e. a flat Dirichlet). */
function weights(r: Rand, k: number): number[] {
  const w = Array.from({ length: k }, () => -Math.log(1 - r()));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}
/** Log-uniform portfolio value. */
const logUniform = (r: Rand, lo: number, hi: number) => Math.exp(Math.log(lo) + r() * (Math.log(hi) - Math.log(lo)));
const spread = (assets: string[], w: number[], total: number) => Object.fromEntries(assets.map((a, i) => [a, (w[i] as number) * total]));

const THEME = ["NVDA", "AAPL", "MSFT", "GOOGL", "META"];
const TECH = ["NVDA", "TSLA", "AAPL", "MSFT", "GOOGL", "META", "AMZN"];
const INDEX_BASE: Record<string, number> = { SPY: 0.4, QQQ: 0.2, AAPL: 0.1, MSFT: 0.1, NVDA: 0.1, AMZN: 0.1 };

function owner(i: number): Address {
  return `0x${(0xa000 + i).toString(16).padStart(40, "0")}` as Address;
}

function randomPortfolio(r: Rand, universe: string[], total: number): Record<string, number> {
  const k = int(r, 2, Math.min(5, universe.length));
  return spread(sample(r, universe, k), weights(r, k), total);
}

/** Each participant sells one asset and buys another that some other participant sells (random functional graph). */
function complementary(r: Rand, symbols: string[], n: number, sizeJitter: () => number): ParticipantDraft[] {
  const sells = sample(r, symbols, Math.min(n, symbols.length));
  while (sells.length < n) sells.push(pick(r, symbols));
  return sells.map((sellAsset, i) => {
    const others = sells.filter((s, j) => j !== i && s !== sellAsset);
    const buyAsset = others.length ? pick(r, others) : pick(r, symbols.filter((s) => s !== sellAsset));
    const value = logUniform(r, 1_000, 20_000);
    const moved = value * sizeJitter();
    return { owner: owner(i), holdingsUsd: { [sellAsset]: value }, targetUsd: { [sellAsset]: value - moved, [buyAsset]: moved }, restrictMarket: false };
  });
}

export function generateScenario(masterSeed: string, cohort: Cohort, index: number, symbols: string[]): Scenario {
  const seed = keccak256(stringToHex(`${masterSeed}:${cohort}:${index}`));
  const r = rng(seed);
  let participants: ParticipantDraft[];
  let costMultiplier = 1;
  let unavailableUniswap: string[] = [];

  const independent = (n: number, universe: string[], lo: number, hi: number) =>
    Array.from({ length: n }, (_, i) => {
      const total = logUniform(r, lo, hi);
      return { owner: owner(i), holdingsUsd: randomPortfolio(r, universe, total), targetUsd: randomPortfolio(r, universe, total), restrictMarket: false };
    });

  switch (cohort) {
    case "RANDOM_INDEPENDENT":
      participants = independent(int(r, 2, 12), symbols, 500, 50_000);
      break;
    case "THEME_CIRCLE":
      participants = independent(int(r, 4, 12), THEME, 500, 50_000);
      break;
    case "INDEX_REBALANCE": {
      const noisy = (total: number) => {
        const raw = Object.entries(INDEX_BASE).map(([a, w]) => [a, w * (0.75 + 0.5 * r())] as const);
        const s = raw.reduce((acc, [, w]) => acc + w, 0);
        return Object.fromEntries(raw.map(([a, w]) => [a, (w / s) * total]));
      };
      participants = Array.from({ length: int(r, 4, 12) }, (_, i) => {
        const total = logUniform(r, 1_000, 50_000);
        return { owner: owner(i), holdingsUsd: noisy(total), targetUsd: noisy(total), restrictMarket: false };
      });
      break;
    }
    case "CONCENTRATED_TECH":
      participants = Array.from({ length: int(r, 3, 10) }, (_, i) => {
        const total = logUniform(r, 1_000, 50_000);
        const core = pick(r, ["NVDA", "TSLA"]);
        const coreShare = 0.6 + 0.3 * r();
        const rest = sample(r, TECH.filter((s) => s !== core), 2);
        const restW = weights(r, 2);
        return {
          owner: owner(i),
          holdingsUsd: { [core]: total * coreShare, [rest[0] as string]: total * (1 - coreShare) * (restW[0] as number), [rest[1] as string]: total * (1 - coreShare) * (restW[1] as number) },
          targetUsd: randomPortfolio(r, TECH, total),
          restrictMarket: false,
        };
      });
      break;
    case "HIGH_COMPLEMENTARITY":
      participants = complementary(r, symbols, int(r, 3, 9), () => 0.3 + 0.2 * r());
      break;
    case "PARTIAL_MATCH":
      participants = complementary(r, symbols, int(r, 3, 9), () => 0.05 + 0.6 * r());
      break;
    case "LOW_COMPLEMENTARITY":
      participants = Array.from({ length: int(r, 4, 12) }, (_, i) => {
        const total = logUniform(r, 1_000, 50_000);
        if (r() < 0.8) {
          const from = pick(r, ["NVDA", "TSLA"]);
          const to = pick(r, ["SPY", "QQQ"]);
          const moved = total * (0.2 + 0.3 * r());
          return { owner: owner(i), holdingsUsd: { [from]: total }, targetUsd: { [from]: total - moved, [to]: moved }, restrictMarket: false };
        }
        return { owner: owner(i), holdingsUsd: randomPortfolio(r, symbols, total), targetUsd: randomPortfolio(r, symbols, total), restrictMarket: false };
      });
      break;
    case "ZERO_OVERLAP": {
      const sellSide = ["NVDA", "TSLA", "AMZN", "META"];
      const buySide = ["SPY", "QQQ", "AAPL", "MSFT", "GOOGL"];
      participants = Array.from({ length: int(r, 2, 10) }, (_, i) => {
        const total = logUniform(r, 1_000, 50_000);
        const from = sample(r, sellSide, int(r, 1, 2));
        const to = sample(r, buySide, int(r, 1, 2));
        const holdings = spread(from, weights(r, from.length), total);
        const moved = 0.2 + 0.5 * r();
        const target: Record<string, number> = Object.fromEntries(from.map((a) => [a, (holdings[a] as number) * (1 - moved)]));
        Object.assign(target, spread(to, weights(r, to.length), total * moved));
        return { owner: owner(i), holdingsUsd: holdings, targetUsd: target, restrictMarket: false };
      });
      break;
    }
    case "SIZE_SKEW": {
      const n = int(r, 4, 10);
      participants = independent(n, symbols, 1_000, 10_000);
      const whale = participants[0] as ParticipantDraft;
      const scale = 500_000 / Object.values(whale.holdingsUsd).reduce((a, b) => a + b, 0);
      whale.holdingsUsd = Object.fromEntries(Object.entries(whale.holdingsUsd).map(([a, v]) => [a, v * scale]));
      whale.targetUsd = Object.fromEntries(Object.entries(whale.targetUsd).map(([a, v]) => [a, v * scale]));
      break;
    }
    case "EXTERNAL_ROUTE_STRESS":
      participants = independent(int(r, 3, 10), symbols, 20, 300).map((p) => ({ ...p, restrictMarket: r() < 0.5 }));
      costMultiplier = 3;
      unavailableUniswap = sample(r, symbols, 2);
      break;
  }
  return { id: `${cohort}-${String(index).padStart(3, "0")}`, cohort, nature: COHORT_NATURE[cohort], seed, participants, costMultiplier, unavailableUniswap };
}

/** USD -> raw token units at the frozen snapshot price, floored. */
export function usdToRaw(usd: number, priceUsdE18: bigint): bigint {
  const usdE18 = BigInt(Math.floor(usd * 1e6)) * 10n ** 12n;
  return (usdE18 * E18) / priceUsdE18;
}
