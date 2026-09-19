import { apiGet, BASE, openUser } from "./session.ts";
import { approve, createCircle, enterLobbyAndSign, joinFromDiscover, residualAndReceipt, setTarget, settle, waitState } from "./steps.ts";

/** Second production ring on the deployed app with already-onboarded accounts: new targets, new Circle, one settlement. */
const dir = process.argv[2] as string;
const users = await Promise.all((["A", "B", "C"] as const).map((l) => openUser(l, dir, { profile: `prod-${l}` })));
const [A, B, C] = users as [(typeof users)[number], (typeof users)[number], (typeof users)[number]];
try {
  const shifts = [[A, { from: "SPY", to: "NVDA", fraction: 0.8 }], [B, { from: "NVDA", to: "AAPL", fraction: 0.8 }], [C, { from: "AAPL", to: "SPY", fraction: 0.6 }]] as const;
  for (const [u, shift] of shifts) {
    await u.page.goto(`${BASE}/portfolio`);
    await setTarget(u, shift);
  }
  const name = `Prod Ring 2 ${new Date().toISOString().slice(11, 19)}`;
  const circleId = await createCircle(A, name, ["NVDA", "AAPL", "SPY"], dir);
  await joinFromDiscover(B, name, dir);
  await joinFromDiscover(C, name, dir);
  const roundId = await enterLobbyAndSign(A, circleId, dir);
  for (const u of [B, C]) if ((await enterLobbyAndSign(u, circleId, dir)) !== roundId) throw new Error(`${u.label} landed in a different round`);
  console.log("state", await waitState(A.page, roundId, ["PROPOSED", "NO_CROSS", "INSUFFICIENT_PARTICIPANTS", "PLAN_STALE"]));
  const agg = await apiGet<{ aggregate: Record<string, unknown>; round: { planHash: string } }>(A.page, `/api/rounds/${roundId}`);
  console.log("aggregate", JSON.stringify(agg.aggregate), "planHash", agg.round.planHash);
  for (const u of [A, B, C]) await approve(u, roundId, dir);
  await settle(B, roundId, dir);
  for (const u of [A, B, C]) await residualAndReceipt(u, roundId, dir);
  const v = await apiGet<{ round: { state: string; settlementTx: string; verification: { status: string; checks: Array<{ status: string }>; providers: unknown } } }>(A.page, `/api/rounds/${roundId}`);
  console.log(JSON.stringify({ circleId, roundId, state: v.round.state, tx: v.round.settlementTx, verifier: v.round.verification.status, passed: v.round.verification.checks.filter((c) => c.status === "PASS").length, total: v.round.verification.checks.length, providers: v.round.verification.providers }));
} catch (error) {
  for (const u of users) await u.page.screenshot({ path: `${dir}/PROD2-FAIL-${u.label}.png` }).catch(() => undefined);
  throw error;
} finally {
  for (const u of users) await u.context.close();
}
