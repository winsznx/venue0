import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { E18, type Address } from "@venue0/shared";
import { matchRound, type MatchInput, type MatchResult } from "@venue0/matcher";
import type { PortfolioIntent } from "@venue0/portfolio";
import { compareWithReference, rat, solveLinearProgram, validateMatchResult } from "../src/index.ts";
import { NOW, ROUND_ID, WALLETS, buy, intent, sell, snapshot, t, universe } from "../../matcher/test/helpers.ts";

const { A, B, C, D, E } = WALLETS;

function input(intents: PortfolioIntent[], snap = snapshot()): MatchInput {
  return { roundId: ROUND_ID, snapshot: snap, intents, universe: universe(), nowSec: NOW };
}

describe("reference simplex", () => {
  it("solves a textbook LP exactly", () => {
    // max 3x + 5y st x <= 4, 2y <= 12, 3x + 2y <= 18 -> x=2, y=6, z=36
    const result = solveLinearProgram({
      objective: [3n, 5n],
      constraints: [
        { coefficients: [1n, 0n], rhs: 4n },
        { coefficients: [0n, 2n], rhs: 12n },
        { coefficients: [3n, 2n], rhs: 18n },
      ],
    });
    expect(result.optimum).toEqual(rat(36n));
    expect(result.x).toEqual([rat(2n), rat(6n)]);
  });

  it("returns fractional optima exactly", () => {
    const result = solveLinearProgram({ objective: [1n], constraints: [{ coefficients: [3n], rhs: 1n }] });
    expect(result.optimum).toEqual(rat(1n, 3n));
  });
});

describe("production vs reference parity", () => {
  it("agrees on the hero cycle, partial overlap and no overlap", () => {
    const snap = snapshot();
    const cases: PortfolioIntent[][] = [
      [
        intent(A, [sell("NVDA", t(15) / 2n), buy("AAPL", t(5))], snap),
        intent(B, [sell("AAPL", t(5)), buy("SPY", t(2))], snap),
        intent(C, [sell("SPY", t(2)), buy("NVDA", t(15) / 2n)], snap),
      ],
      [intent(A, [sell("NVDA", t(15)), buy("AAPL", t(10))], snap), intent(B, [sell("AAPL", t(4)), buy("NVDA", t(6))], snap)],
      [intent(A, [sell("NVDA", t(5)), buy("AAPL", t(3))], snap), intent(B, [sell("SPY", t(1)), buy("QQQ", t(1))], snap)],
    ];
    for (const intents of cases) {
      const i = input(intents, snap);
      const report = compareWithReference(matchRound(i), i);
      expect(report).toMatchObject({ ok: true, validationIssues: [], eligibilityDisagreements: [] });
    }
  });

  it("detects a tampered production result", () => {
    const snap = snapshot();
    const i = input([intent(A, [sell("NVDA", t(3)), buy("AAPL", t(2))], snap), intent(B, [sell("AAPL", t(2)), buy("NVDA", t(3))], snap)], snap);
    const honest = matchRound(i);
    const inflated: MatchResult = { ...honest, legs: honest.legs.map((l, idx) => (idx === 0 ? { ...l, amountRaw: l.amountRaw + E18 } : l)) };
    expect(validateMatchResult(inflated, i).join("\n")).toMatch(/above maxOut|value imbalance|crossed/);
    const shrunk: MatchResult = { ...honest, legs: honest.legs.map((l) => ({ ...l, lots: l.lots - 1n })) };
    expect(compareWithReference(shrunk, i).objectiveAgrees).toBe(false);
  });

  it("agrees with production on random 2-5 participant rounds", () => {
    const symbols = ["NVDA", "AAPL", "SPY", "QQQ", "TSLA"];
    const owners: Address[] = [A, B, C, D, E];
    const draft = fc.tuple(
      fc.uniqueArray(fc.constantFrom(...symbols), { minLength: 2, maxLength: 3 }),
      fc.array(fc.bigInt({ min: 1n, max: 40n * E18 }), { minLength: 3, maxLength: 3 }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }).chain((n) => fc.array(draft, { minLength: n, maxLength: n })), (drafts) => {
        const snap = snapshot();
        const intents = drafts.map(([assets, amounts], k) =>
          intent(owners[k] as Address, assets.map((s, j) => (j === 0 ? sell(s, amounts[j] as bigint) : buy(s, amounts[j] as bigint))), snap),
        );
        const i = input(intents, snap);
        const report = compareWithReference(matchRound(i), i);
        expect(report.validationIssues).toEqual([]);
        expect(report.eligibilityDisagreements).toEqual([]);
        expect(report.referenceOptimumLots).toEqual(rat(report.productionCrossedLots));
      }),
      { numRuns: 150, seed: 4663 },
    );
  });
});
