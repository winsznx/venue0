import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { intentTypedData } from "@venue0/settlement";
import type { AssetDeltaLimit, PortfolioIntent } from "@venue0/portfolio";
import { CircleError, CircleService } from "../src/index.ts";
import { ASSETS, NOW, buy, intent, sell, snapshot, t, universe } from "../../matcher/test/helpers.ts";

const SETTLEMENT = "0x9cf871315674830046ab0541ee018f6978e86a3d" as Address;
const keys = ["a", "b", "c", "d", "e"].map((l) => privateKeyToAccount(keccak256(stringToHex(`circle-test-${l}`))));
const [org, alice, bob, carol, mallory] = keys as [typeof keys[0], typeof keys[0], typeof keys[0], typeof keys[0], typeof keys[0]];
const theme = [ASSETS.NVDA, ASSETS.AAPL, ASSETS.SPY].map((a) => a?.uid as Hex);

function service() {
  return new CircleService(universe(), () => NOW);
}

function newCircle(svc: CircleService, visibility: "PUBLIC" | "INVITE_ONLY" | "PRIVATE" = "PUBLIC", privacyMode: "DELTAS_ONLY" | "AGGREGATE_ONLY" = "DELTAS_ONLY") {
  return svc.createCircle({ name: "AI Stocks Club", visibility, organizer: org.address, allowedAssetUids: theme, minParticipants: 2, defaultRoundDurationSec: 600, privacyMode });
}

async function signed(svc: CircleService, roundId: Hex, account: typeof alice, assets: AssetDeltaLimit[]): Promise<{ intent: PortfolioIntent; signature: Hex }> {
  const round = svc.getRound(roundId);
  const i = intent(account.address, assets, snapshot(), { roundId, circleId: round.circleId });
  return { intent: i, signature: await account.signTypedData(intentTypedData(i, SETTLEMENT)) };
}

async function heroRound(svc: CircleService) {
  const circle = newCircle(svc);
  for (const m of [alice, bob, carol]) svc.join(circle.id, m.address);
  const round = svc.createRound(circle.id, org.address, SETTLEMENT);
  svc.openRound(round.id, org.address);
  const submissions = [
    await signed(svc, round.id, alice, [sell("NVDA", t(15) / 2n), buy("AAPL", t(5))]),
    await signed(svc, round.id, bob, [sell("AAPL", t(5)), buy("SPY", t(2))]),
    await signed(svc, round.id, carol, [sell("SPY", t(2)), buy("NVDA", t(15) / 2n)]),
  ];
  for (const s of submissions) await svc.submitIntent(round.id, s.intent, s.signature);
  return { circle, round, submissions };
}

describe("circle membership", () => {
  it("lets anyone join a public circle, idempotently", () => {
    const svc = service();
    const circle = newCircle(svc);
    const first = svc.join(circle.id, alice.address);
    expect(svc.join(circle.id, alice.address)).toBe(first);
    expect(svc.listCircles().map((c) => c.id)).toContain(circle.id);
  });

  it("requires a single-use invite for invite-only circles", () => {
    const svc = service();
    const circle = newCircle(svc, "INVITE_ONLY");
    expect(() => svc.join(circle.id, alice.address)).toThrow(CircleError);
    const code = svc.createInvite(circle.id, org.address);
    svc.join(circle.id, alice.address, { inviteCode: code });
    expect(() => svc.join(circle.id, bob.address, { inviteCode: code })).toThrow(/used invite/);
  });

  it("only lets the organizer add members to a private circle and hides it from discovery", () => {
    const svc = service();
    const circle = newCircle(svc, "PRIVATE");
    expect(() => svc.join(circle.id, alice.address)).toThrow(/organizer adds you/);
    expect(() => svc.join(circle.id, alice.address, { addedBy: bob.address })).toThrow();
    svc.join(circle.id, alice.address, { addedBy: org.address });
    expect(svc.listCircles().map((c) => c.id)).not.toContain(circle.id);
    expect(svc.listCircles(alice.address).map((c) => c.id)).toContain(circle.id);
  });

  it("shows only a member count to members of aggregate-only circles", () => {
    const svc = service();
    const circle = newCircle(svc, "PUBLIC", "AGGREGATE_ONLY");
    svc.join(circle.id, alice.address);
    expect(svc.listMembers(circle.id, alice.address)).toEqual({ count: 2 });
    expect(Array.isArray(svc.listMembers(circle.id, org.address))).toBe(true);
    expect(() => svc.listMembers(circle.id, mallory.address)).toThrow(/only members/);
  });

  it("rejects non-canonical assets and invalid configuration", () => {
    const svc = service();
    expect(() => svc.createCircle({ name: "x", visibility: "PUBLIC", organizer: org.address, allowedAssetUids: [`0x${"99".repeat(32)}`], minParticipants: 2, defaultRoundDurationSec: 60, privacyMode: "DELTAS_ONLY" })).toThrow(/canonical/);
    expect(() => svc.createCircle({ name: "x", visibility: "PUBLIC", organizer: org.address, allowedAssetUids: theme, minParticipants: 1, defaultRoundDurationSec: 60, privacyMode: "DELTAS_ONLY" })).toThrow(/at least 2/);
  });
});

describe("circle rounds use the real matcher", () => {
  it("collects signed intents and discovers the 3-member cycle", async () => {
    const svc = service();
    const { round } = await heroRound(svc);
    const solved = svc.freezeAndSolve(round.id, snapshot());
    expect(solved.state).toBe("PROPOSED");
    expect(solved.match?.cycles[0]).toHaveLength(3);
    expect(solved.history.map((h) => h.to)).toEqual(["OPEN", "COLLECTING", "FROZEN", "SOLVING", "PROPOSED"]);
  });

  it("rejects non-members, bad signatures, foreign assets and wrong rounds", async () => {
    const svc = service();
    const { circle, round, submissions } = await heroRound(svc);
    const outsider = await signed(svc, round.id, mallory, [sell("NVDA", t(1)), buy("AAPL", t(1))]);
    await expect(svc.submitIntent(round.id, outsider.intent, outsider.signature)).rejects.toThrow(/not a member/);

    const forged = submissions[0] as { intent: PortfolioIntent; signature: Hex };
    await expect(svc.submitIntent(round.id, { ...forged.intent, assets: [sell("NVDA", t(99)), buy("AAPL", t(5))] }, forged.signature)).rejects.toThrow(/signed by/);

    svc.join(circle.id, mallory.address);
    const foreign = await signed(svc, round.id, mallory, [sell("NVDA", t(1)), buy("QQQ", t(1))]);
    await expect(svc.submitIntent(round.id, foreign.intent, foreign.signature)).rejects.toThrow(/outside this circle/);

    const other = svc.createRound(circle.id, org.address, SETTLEMENT);
    await expect(svc.submitIntent(other.id, forged.intent, forged.signature)).rejects.toThrow(/not accepting/);
  });

  it("treats identical resubmission as idempotent and a changed intent as a replacement", async () => {
    const svc = service();
    const { round, submissions } = await heroRound(svc);
    const first = submissions[0] as { intent: PortfolioIntent; signature: Hex };
    expect(await svc.submitIntent(round.id, first.intent, first.signature)).toBe("UNCHANGED");
    const changed = await signed(svc, round.id, alice, [sell("NVDA", t(3)), buy("AAPL", t(2))]);
    expect(await svc.submitIntent(round.id, changed.intent, changed.signature)).toBe("REPLACED");
  });

  it("ends as INSUFFICIENT_PARTICIPANTS below the circle minimum", async () => {
    const svc = service();
    const circle = newCircle(svc);
    svc.join(circle.id, alice.address);
    const round = svc.createRound(circle.id, org.address, SETTLEMENT);
    svc.openRound(round.id, org.address);
    const s = await signed(svc, round.id, alice, [sell("NVDA", t(3)), buy("AAPL", t(2))]);
    await svc.submitIntent(round.id, s.intent, s.signature);
    expect(svc.freezeAndSolve(round.id, snapshot()).state).toBe("INSUFFICIENT_PARTICIPANTS");
  });

  it("refuses illegal state transitions", () => {
    const svc = service();
    const circle = newCircle(svc);
    const round = svc.createRound(circle.id, org.address, SETTLEMENT);
    expect(() => svc.transition(round.id, "SETTLED")).toThrow(/cannot move/);
    expect(() => svc.openRound(round.id, alice.address)).toThrow(/organizer/);
  });
});

describe("privacy-safe statistics", () => {
  it("publishes totals without addresses and suppresses thin per-asset data", async () => {
    const svc = service();
    const { round } = await heroRound(svc);
    svc.freezeAndSolve(round.id, snapshot());
    const stats = svc.aggregateStats(round.id);
    const serialized = JSON.stringify(stats, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)).toLowerCase();
    for (const m of [alice, bob, carol]) expect(serialized).not.toContain(m.address.toLowerCase().slice(2));
    expect(stats.participantCount).toBe(3);
    expect(stats.perAsset.every((a) => "suppressed" in a)).toBe(true);
    expect(svc.aggregateStats(round.id, 2).perAsset.some((a) => !("suppressed" in a))).toBe(true);
  });

  it("shows a member only their own fills", async () => {
    const svc = service();
    const { round } = await heroRound(svc);
    svc.freezeAndSolve(round.id, snapshot());
    const view = svc.memberView(round.id, alice.address);
    expect(view.ownFills.every((f) => f.owner === alice.address)).toBe(true);
    expect(view.ownFills.length).toBe(2);
    expect(() => svc.memberView(round.id, mallory.address)).toThrow();
  });
});

describe("recurring rounds and aggregated residuals", () => {
  it("schedules the next round window from the cadence", () => {
    const svc = service();
    const circle = svc.createCircle({ name: "Weekly", visibility: "PUBLIC", organizer: org.address, allowedAssetUids: theme, minParticipants: 2, defaultRoundDurationSec: 600, roundCadenceSec: 86_400, cadenceAnchor: NOW - 3_600, privacyMode: "DELTAS_ONLY" });
    expect(svc.nextRoundWindow(circle.id)).toEqual({ opensAt: NOW - 3_600 + 86_400, freezesAt: NOW - 3_600 + 86_400 + 600 });
  });

  it("carries an aggregated residual into the next round of the same circle only", async () => {
    const svc = service();
    const { circle, round } = await heroRound(svc);
    const next = svc.createRound(circle.id, org.address, SETTLEMENT);
    const carried = svc.carryResiduals(round.id, next.id, [{ owner: alice.address, assetUid: ASSETS.NVDA?.uid as Hex, side: "SELL", amountRaw: 12_345n }]);
    expect(carried.get(alice.address)?.[0]).toMatchObject({ maxOutRaw: 12_345n, maxInRaw: 0n });
    const otherCircle = newCircle(svc);
    const foreign = svc.createRound(otherCircle.id, org.address, SETTLEMENT);
    expect(() => svc.carryResiduals(round.id, foreign.id, [])).toThrow(/same circle/);
    expect(() => svc.carryResiduals(next.id, round.id, [])).toThrow(/forward/);
  });
});
