import { apiGet, BASE, openUser } from "./session.ts";
import { approve, createCircle, enterLobbyAndSign, joinFromDiscover, onboard, residualAndReceipt, setTarget, settle, waitState } from "./steps.ts";

/**
 * Three operator-controlled test users form a genuine ring: A sells SPY for NVDA, B sells NVDA for AAPL, C sells AAPL for
 * SPY. No two of them can trade with each other; only the three-way cycle crosses.
 */
const dir = process.argv[2] as string;
const A = await openUser("A", dir);
const B = await openUser("B", dir);
const C = await openUser("C", dir);
try {
  await onboard(C, { from: "AAPL", to: "SPY", fraction: 0.45 }, dir);
  for (const [u, shift] of [[A, { from: "SPY", to: "NVDA", fraction: 0.8 }], [B, { from: "NVDA", to: "AAPL", fraction: 0.9 }]] as const) {
    await u.page.goto(`${BASE}/portfolio`);
    await setTarget(u, shift);
  }
  const name = `E2E Ring ${new Date().toISOString().slice(11, 19)}`;
  const circleId = await createCircle(A, name, ["NVDA", "AAPL", "SPY"], dir);
  await joinFromDiscover(B, name, dir);
  await joinFromDiscover(C, name, dir);
  const roundId = await enterLobbyAndSign(A, circleId, dir);
  for (const u of [B, C]) if ((await enterLobbyAndSign(u, circleId, dir)) !== roundId) throw new Error(`${u.label} landed in a different round`);
  console.log("state", await waitState(A.page, roundId, ["PROPOSED", "NO_CROSS", "INSUFFICIENT_PARTICIPANTS", "PLAN_STALE"]));
  const view = await apiGet<{ aggregate: { cycleCount: number; legCount: number; participants: number }; round: { planHash: string } }>(A.page, `/api/rounds/${roundId}`);
  console.log("aggregate", JSON.stringify(view.aggregate), "planHash", view.round.planHash);
  for (const u of [A, B, C]) await approve(u, roundId, dir);
  await settle(C, roundId, dir);
  for (const u of [A, B, C]) await residualAndReceipt(u, roundId, dir);
  console.log(JSON.stringify({ circleId, roundId }));
} catch (error) {
  for (const u of [A, B, C]) await u.page.screenshot({ path: `${dir}/FAIL2-${u.label}.png` }).catch(() => undefined);
  throw error;
} finally {
  for (const u of [A, B, C]) await u.context.close();
}
