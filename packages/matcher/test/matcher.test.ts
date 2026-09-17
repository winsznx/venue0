import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { valueUsdE18 } from "@venue0/assets";
import { E18, type Address } from "@venue0/shared";
import { matchRound, minCostCirculation, type MatchResult } from "../src/index.ts";
import { ASSETS, NOW, ROUND_ID, WALLETS, buy, intent, sell, snapshot, t, universe } from "./helpers.ts";
import type { PortfolioIntent } from "@venue0/portfolio";

const { A, B, C, D } = WALLETS;

function run(intents: PortfolioIntent[], snap = snapshot(), nowSec = NOW): MatchResult {
  return matchRound({ roundId: ROUND_ID, snapshot: snap, intents, universe: universe(), nowSec });
}

function legsAsText(result: MatchResult): string[] {
  const symbolOf = (uid: string) => Object.values(ASSETS).find((a) => a.uid === uid)?.symbol;
  const name = (addr: Address) => Object.entries(WALLETS).find(([, w]) => w === addr)?.[0];
  return result.legs.map((l) => `${name(l.from)}.${symbolOf(l.assetUid)}->${name(l.to)}`).sort();
}

/** Invariants every result must satisfy, independent of the scenario. */
function assertInvariants(result: MatchResult, intents: PortfolioIntent[]) {
  const snap = snapshot();
  const priceOf = (uid: string) => snap.prices.find((p) => p.assetUid === uid)?.priceUsdE18 as bigint;
  for (const leg of result.legs) {
    expect(leg.amountRaw).toBeGreaterThan(0n);
    expect(leg.from).not.toBe(leg.to);
  }
  for (const i of intents) {
    for (const limit of i.assets) {
      const out = result.legs.filter((l) => l.from === i.owner && l.assetUid === limit.assetUid).reduce((s, l) => s + l.amountRaw, 0n);
      const inn = result.legs.filter((l) => l.to === i.owner && l.assetUid === limit.assetUid).reduce((s, l) => s + l.amountRaw, 0n);
      expect(out).toBeLessThanOrEqual(limit.maxOutRaw);
      expect(inn).toBeLessThanOrEqual(limit.maxInRaw);
    }
  }
  for (const f of result.fills) {
    expect(f.crossedRaw + f.residualRaw).toBe(f.requestedRaw);
    const drift = f.requestedValueUsdE18 - f.crossedValueUsdE18 - f.residualValueUsdE18;
    expect(drift >= 0n && drift <= 1n).toBe(true);
  }
  for (const p of result.participants) {
    const legCount = BigInt(result.legs.filter((l) => l.from === p.owner || l.to === p.owner).length);
    const tolerance = legCount * (1_000n + 1n);
    const imbalance = p.imbalanceUsdE18 < 0n ? -p.imbalanceUsdE18 : p.imbalanceUsdE18;
    expect(imbalance).toBeLessThanOrEqual(tolerance);
  }
  const t2 = result.totals;
  expect(t2.crossedNotionalUsdE18).toBeLessThanOrEqual(t2.requestedNotionalUsdE18);
  const crossedFromLegs = result.legs.reduce((s, l) => s + 2n * valueUsdE18(l.amountRaw, priceOf(l.assetUid)), 0n);
  const notionalDrift = crossedFromLegs - t2.crossedNotionalUsdE18;
  expect(notionalDrift >= -2n * BigInt(result.legs.length) && notionalDrift <= 0n).toBe(true);
}

describe("circulation solver", () => {
  it("finds the max circulation on a triangle with a bottleneck", () => {
    const flow = minCostCirculation(3, [
      { from: 0, to: 1, capacity: 5n, cost: -1 },
      { from: 1, to: 2, capacity: 3n, cost: -1 },
      { from: 2, to: 0, capacity: 10n, cost: -1 },
    ]);
    expect(flow).toEqual([3n, 3n, 3n]);
  });

  it("returns zero flow when there is no cycle", () => {
    expect(minCostCirculation(3, [
      { from: 0, to: 1, capacity: 5n, cost: -1 },
      { from: 1, to: 2, capacity: 5n, cost: -1 },
    ])).toEqual([0n, 0n]);
  });

  it("reroutes flow when a greedy first cycle is suboptimal", () => {
    // Two disjoint 2-cycles share node 0's capacity-limited edge with a longer 3-cycle.
    const flow = minCostCirculation(4, [
      { from: 0, to: 1, capacity: 4n, cost: -1 },
      { from: 1, to: 0, capacity: 4n, cost: -1 },
      { from: 1, to: 2, capacity: 4n, cost: -1 },
      { from: 2, to: 3, capacity: 4n, cost: -1 },
      { from: 3, to: 1, capacity: 4n, cost: -1 },
    ]);
    const cost = flow.reduce((s, f) => s - f, 0n);
    expect(cost).toBe(-20n);
  });
});

describe("matchRound", () => {
  it("discovers the 3-wallet, 3-asset hero cycle with no bilateral solution", () => {
    const snap = snapshot();
    // $1,500 each: A sells 7.5 NVDA wants 5 AAPL, B sells 5 AAPL wants 2 SPY, C sells 2 SPY wants 7.5 NVDA.
    const intents = [
      intent(A, [sell("NVDA", 7_500_000_000_000_000_000n), buy("AAPL", t(5))], snap),
      intent(B, [sell("AAPL", t(5)), buy("SPY", t(2))], snap),
      intent(C, [sell("SPY", t(2)), buy("NVDA", 7_500_000_000_000_000_000n)], snap),
    ];
    const result = run(intents, snap);
    expect(result.status).toBe("CROSSED");
    expect(legsAsText(result)).toEqual(["A.NVDA->C", "B.AAPL->A", "C.SPY->B"]);
    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]).toHaveLength(3);
    expect(result.totals.crossRateBps).toBe(10_000n);
    expect(result.totals.transferNotionalUsdE18).toBe(4_500n * E18);
    assertInvariants(result, intents);
  });

  it("crosses an exact bilateral swap", () => {
    const snap = snapshot();
    const intents = [
      intent(A, [sell("NVDA", t(3)), buy("AAPL", t(2))], snap),
      intent(B, [sell("AAPL", t(2)), buy("NVDA", t(3))], snap),
    ];
    const result = run(intents, snap);
    expect(result.status).toBe("CROSSED");
    expect(legsAsText(result)).toEqual(["A.NVDA->B", "B.AAPL->A"]);
    assertInvariants(result, intents);
  });

  it("discovers a 4-cycle", () => {
    const snap = snapshot();
    // $2,100 each hop.
    const intents = [
      intent(A, [sell("NVDA", t(21) / 2n), buy("AAPL", t(7))], snap),
      intent(B, [sell("AAPL", t(7)), buy("QQQ", t(3))], snap),
      intent(C, [sell("QQQ", t(3)), buy("SPY", t(28) / 10n)], snap),
      intent(D, [sell("SPY", t(28) / 10n), buy("NVDA", t(21) / 2n)], snap),
    ];
    const result = run(intents, snap);
    expect(result.status).toBe("CROSSED");
    expect(result.legs).toHaveLength(4);
    expect(result.cycles.map((c) => c.length)).toEqual([4]);
    assertInvariants(result, intents);
  });

  it("crosses only the overlapping part and reports exact residual", () => {
    const snap = snapshot();
    // A wants to move $3,000 of NVDA into AAPL; B only offers $1,200 of AAPL for NVDA.
    const intents = [
      intent(A, [sell("NVDA", t(15)), buy("AAPL", t(10))], snap),
      intent(B, [sell("AAPL", t(4)), buy("NVDA", t(6))], snap),
    ];
    const result = run(intents, snap);
    expect(result.status).toBe("PARTIAL_CROSS");
    const aNvda = result.fills.find((f) => f.owner === A && f.side === "SELL");
    expect(aNvda?.crossedRaw).toBe(t(6));
    expect(aNvda?.residualRaw).toBe(t(9));
    const aAapl = result.fills.find((f) => f.owner === A && f.side === "BUY");
    expect(aAapl?.crossedRaw).toBe(t(4));
    expect(aAapl?.residualRaw).toBe(t(6));
    expect(result.totals.crossedNotionalUsdE18).toBe(4_800n * E18);
    expect(result.totals.requestedNotionalUsdE18).toBe(8_400n * E18);
    expect(result.totals.residualNotionalUsdE18).toBe(3_600n * E18);
    assertInvariants(result, intents);
  });

  it("returns NO_CROSS with the full request as residual when nothing overlaps", () => {
    const snap = snapshot();
    const intents = [
      intent(A, [sell("NVDA", t(5)), buy("AAPL", t(3))], snap),
      intent(B, [sell("SPY", t(1)), buy("QQQ", t(1))], snap),
      intent(C, [sell("NVDA", t(2)), buy("QQQ", t(1))], snap),
    ];
    const result = run(intents, snap);
    expect(result.status).toBe("NO_CROSS");
    expect(result.legs).toEqual([]);
    expect(result.totals.crossedNotionalUsdE18).toBe(0n);
    expect(result.totals.residualNotionalUsdE18).toBe(result.totals.requestedNotionalUsdE18);
    for (const f of result.fills) expect(f.residualRaw).toBe(f.requestedRaw);
    assertInvariants(result, intents);
  });

  it("does not manufacture a cross from one-directional demand", () => {
    const snap = snapshot();
    const intents = [
      intent(A, [sell("NVDA", t(5)), buy("AAPL", t(3))], snap),
      intent(B, [sell("NVDA", t(5)), buy("AAPL", t(3))], snap),
    ];
    expect(run(intents, snap).status).toBe("NO_CROSS");
  });

  it("splits one asset across multiple sellers and multiple buyers", () => {
    const snap = snapshot();
    const intents = [
      intent(A, [sell("NVDA", t(3)), buy("AAPL", t(2))], snap),
      intent(B, [sell("NVDA", t(3)), buy("AAPL", t(2))], snap),
      intent(C, [sell("AAPL", t(4)), buy("NVDA", t(2))], snap),
      intent(D, [sell("AAPL", t(4)), buy("NVDA", t(4))], snap),
    ];
    const result = run(intents, snap);
    expect(result.status).toBe("PARTIAL_CROSS");
    expect(2_400n * E18 - result.totals.transferNotionalUsdE18).toBeLessThan(BigInt(result.legs.length) * 1_000n);
    const nvdaLegs = result.legs.filter((l) => l.assetUid === ASSETS.NVDA?.uid);
    expect(nvdaLegs.reduce((s, l) => s + l.amountRaw, 0n)).toBe(t(6));
    assertInvariants(result, intents);
  });

  it("keeps exact value balance per participant under non-round prices", () => {
    const snap = snapshot({ NVDA: 219_672_148_980_000_000_000n, AAPL: 335_244_667_950_000_000_000n, SPY: 762_858_450_000_000_000_000n });
    const intents = [
      intent(A, [sell("NVDA", 7_123_456_789_012_345_678n), buy("AAPL", t(5))], snap),
      intent(B, [sell("AAPL", t(5)), buy("SPY", t(2))], snap),
      intent(C, [sell("SPY", 2_345_678_901_234_567_890n), buy("NVDA", t(8))], snap),
    ];
    const result = run(intents, snap);
    expect(result.legs).toHaveLength(3);
    for (const p of result.participants) {
      const imbalance = p.imbalanceUsdE18 < 0n ? -p.imbalanceUsdE18 : p.imbalanceUsdE18;
      expect(imbalance).toBeLessThan(10_000n);
    }
    for (const leg of result.legs) expect(leg.lots * 10n ** 16n - leg.valueUsdE18).toBeLessThan(10_000n);
  });

  it("floors capacity to whole lots so no sub-cent dust legs appear", () => {
    const snap = snapshot();
    const intents = [
      intent(A, [sell("NVDA", 1_000n), buy("AAPL", t(1))], snap),
      intent(B, [sell("AAPL", t(1)), buy("NVDA", t(1))], snap),
    ];
    const result = run(intents, snap);
    expect(result.status).toBe("NO_CROSS");
  });

  it("rejects expired, wrong-round, wrong-snapshot and lookalike-token intents", () => {
    const snap = snapshot();
    const lookalike = { ...sell("AAPL", t(2)), token: "0x000000000000000000000000000000000000dEaD" as Address };
    const intents = [
      intent(A, [sell("NVDA", t(3)), buy("AAPL", t(2))], snap, { validUntil: NOW - 1 }),
      intent(B, [lookalike, buy("NVDA", t(3))], snap),
      intent(C, [sell("AAPL", t(2)), buy("NVDA", t(3))], snap, { roundId: `0x${"00".repeat(32)}` }),
      intent(D, [sell("AAPL", t(2)), buy("NVDA", t(3))], snap, { valuationSnapshotHash: `0x${"11".repeat(32)}` }),
    ];
    const result = run(intents, snap);
    expect(result.status).toBe("INSUFFICIENT_PARTICIPANTS");
    const reasons = Object.fromEntries(result.participants.map((p) => [p.owner, p.reasons.join("; ")]));
    expect(reasons[A]).toMatch(/expired/);
    expect(reasons[B]).toMatch(/not the canonical address/);
    expect(reasons[C]).toMatch(/different round/);
    expect(reasons[D]).toMatch(/different valuation snapshot/);
    expect(result.legs).toEqual([]);
  });

  it("refuses to solve on a stale snapshot", () => {
    const snap = snapshot({}, NOW - 10_000);
    const intents = [
      intent(A, [sell("NVDA", t(3)), buy("AAPL", t(2))], snap),
      intent(B, [sell("AAPL", t(2)), buy("NVDA", t(3))], snap),
    ];
    const result = run(intents, snap);
    expect(result.status).toBe("PLAN_STALE");
    expect(result.legs).toEqual([]);
    expect(result.totals.residualNotionalUsdE18).toBe(result.totals.requestedNotionalUsdE18);
  });

  it("excludes a participant whose minimum cross percentage is not met and re-solves", () => {
    const snap = snapshot();
    const intents = [
      intent(A, [sell("NVDA", t(15)), buy("AAPL", t(10))], snap, {}, { minCrossPercentBps: 5_000 }),
      intent(B, [sell("AAPL", t(4)), buy("NVDA", t(6))], snap),
    ];
    const result = run(intents, snap);
    expect(result.status).toBe("NO_CROSS");
    expect(result.participants.find((p) => p.owner === A)?.status).toBe("EXCLUDED_MIN_CROSS");
  });

  it("respects allowPartialCross=false", () => {
    const snap = snapshot();
    const intents = [
      intent(A, [sell("NVDA", t(15)), buy("AAPL", t(10))], snap, {}, { allowPartialCross: false }),
      intent(B, [sell("AAPL", t(10)), buy("NVDA", t(15))], snap, {}, { allowPartialCross: false }),
    ];
    expect(run(intents, snap).status).toBe("CROSSED");
    const partial = [intents[0] as PortfolioIntent, intent(B, [sell("AAPL", t(4)), buy("NVDA", t(6))], snap)];
    expect(run(partial, snap).status).toBe("NO_CROSS");
  });

  it("classifies sub-threshold leftovers of crossed fills as dust, not external orders", () => {
    const snap = snapshot();
    // A's AAPL demand exceeds B's offer by $0.03; A's NVDA sell exceeds B's demand by $0.02.
    const intents = [
      intent(A, [sell("NVDA", t(6) + 10n ** 14n), buy("AAPL", t(4) + 10n ** 14n)], snap),
      intent(B, [sell("AAPL", t(4)), buy("NVDA", t(6))], snap),
    ];
    const result = run(intents, snap);
    expect(result.status).toBe("CROSSED");
    expect(result.totals.externalResidualCount).toBe(0);
    expect(result.totals.residualNotionalUsdE18).toBe(result.totals.dustResidualNotionalUsdE18);
    expect(result.totals.residualNotionalUsdE18).toBeGreaterThan(0n);

    const uncrossedSmall = run([intent(A, [sell("NVDA", 10n ** 14n), buy("AAPL", 10n ** 14n)], snap), intent(B, [sell("SPY", t(1)), buy("QQQ", t(1))], snap)], snap);
    expect(uncrossedSmall.fills.every((f) => f.residualClass === "EXTERNAL")).toBe(true);
  });

  it("is deterministic regardless of intent order", () => {
    const snap = snapshot();
    const intents = [
      intent(A, [sell("NVDA", t(7)), buy("AAPL", t(5))], snap),
      intent(B, [sell("AAPL", t(5)), buy("SPY", t(2))], snap),
      intent(C, [sell("SPY", t(2)), buy("NVDA", t(7))], snap),
    ];
    const first = run(intents, snap);
    const second = run([...intents].reverse(), snap);
    expect(second.outputHash).toBe(first.outputHash);
    expect(second.inputHash).toBe(first.inputHash);
  });
});

describe("matchRound properties", () => {
  const symbols = ["NVDA", "AAPL", "SPY", "QQQ", "TSLA"];
  const owners = Object.values(WALLETS);

  const arbIntent = (owner: Address) =>
    fc
      .tuple(
        fc.uniqueArray(fc.constantFrom(...symbols), { minLength: 2, maxLength: 4 }),
        fc.array(fc.bigInt({ min: 1n, max: 50n * E18 }), { minLength: 4, maxLength: 4 }),
        fc.integer({ min: 1, max: 3 }),
      )
      .map(([assets, amounts, sellCount]) => {
        const sells = Math.min(sellCount, assets.length - 1);
        return assets.map((s, i) => (i < sells ? sell(s, amounts[i] as bigint) : buy(s, amounts[i] as bigint)));
      })
      .map((limits) => ({ owner, limits }));

  it("never overspends, conserves every asset, balances value and preserves requested = crossed + residual", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }).chain((n) => fc.tuple(...owners.slice(0, n).map(arbIntent))), (drafts) => {
        const snap = snapshot();
        const intents = drafts.map((d) => intent(d.owner, d.limits, snap));
        const result = run(intents, snap);
        assertInvariants(result, intents);
        for (const asset of symbols) {
          const uid = ASSETS[asset]?.uid;
          const sent = result.fills.filter((f) => f.assetUid === uid && f.side === "SELL").reduce((s, f) => s + f.crossedRaw, 0n);
          const received = result.fills.filter((f) => f.assetUid === uid && f.side === "BUY").reduce((s, f) => s + f.crossedRaw, 0n);
          expect(sent).toBe(received);
        }
      }),
      { numRuns: 300, seed: 4663 },
    );
  });
});
