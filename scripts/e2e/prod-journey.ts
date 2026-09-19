import { apiGet, BASE, openUser } from "./session.ts";
import { approve, createCircle, enterLobbyAndSign, joinFromDiscover, onboard, residualAndReceipt, settle, waitState } from "./steps.ts";

/**
 * Production journey on the public deployment: three operator-controlled test accounts in fresh browser profiles
 * onboard through Dynamic, form one Circle and settle one three-way cycle. A sells NVDA for SPY, B sells AAPL for NVDA,
 * C sells SPY for AAPL; no pair of them can trade directly.
 */
const dir = process.argv[2] as string;
const users = await Promise.all((["A", "B", "C"] as const).map((l) => openUser(l, dir, { profile: `prod-${l}` })));
const [A, B, C] = users as [(typeof users)[number], (typeof users)[number], (typeof users)[number]];
try {
  console.log(`base ${BASE}`);
  // Each Dynamic sign-in counts against the sandbox's per-IP limit, so accounts that already finished onboarding in
  // their saved profile are not signed in again.
  const plans = [[A, { from: "NVDA", to: "SPY", fraction: 0.5 }], [B, { from: "AAPL", to: "NVDA", fraction: 0.6 }], [C, { from: "SPY", to: "AAPL", fraction: 0.9 }]] as const;
  for (const [u, shift] of plans) {
    await u.page.goto(`${BASE}/app`);
    if (u.page.url().endsWith("/app")) console.log(`[${u.label}] already onboarded on this deployment; session resumed`);
    else await onboard(u, shift, dir);
  }
  const name = `Prod Ring ${new Date().toISOString().slice(11, 19)}`;
  const circleId = await createCircle(A, name, ["NVDA", "AAPL", "SPY"], dir);
  await joinFromDiscover(B, name, dir);
  await joinFromDiscover(C, name, dir);
  const roundId = await enterLobbyAndSign(A, circleId, dir);
  for (const u of [B, C]) if ((await enterLobbyAndSign(u, circleId, dir)) !== roundId) throw new Error(`${u.label} landed in a different round`);
  console.log("state", await waitState(A.page, roundId, ["PROPOSED", "NO_CROSS", "INSUFFICIENT_PARTICIPANTS", "PLAN_STALE"]));
  const view = await apiGet<{ aggregate: Record<string, unknown>; round: { planHash: string } }>(A.page, `/api/rounds/${roundId}`);
  console.log("aggregate", JSON.stringify(view.aggregate), "planHash", view.round.planHash);
  for (const u of [A, B, C]) await approve(u, roundId, dir);
  await settle(C, roundId, dir);
  for (const u of [A, B, C]) await residualAndReceipt(u, roundId, dir);
  const final = await apiGet<{ round: { settlementTx: string; verification: { status: string; providers: unknown } } }>(A.page, `/api/rounds/${roundId}`);
  console.log(JSON.stringify({ circleId, roundId, settlementTx: final.round.settlementTx, verifier: final.round.verification.status, providers: final.round.verification.providers }));
} catch (error) {
  for (const u of users) await u.page.screenshot({ path: `${dir}/PROD-FAIL-${u.label}.png` }).catch(() => undefined);
  throw error;
} finally {
  for (const u of users) await u.context.close();
}
