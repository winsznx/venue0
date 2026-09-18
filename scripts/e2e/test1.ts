import { openUser } from "./session.ts";
import { approve, createCircle, enterLobbyAndSign, joinFromDiscover, onboard, residualAndReceipt, settle, waitState } from "./steps.ts";

const dir = process.argv[2] as string;
const A = await openUser("A", dir);
const B = await openUser("B", dir);
try {
  await onboard(A, { from: "AAPL", to: "NVDA", fraction: 0.5 }, dir);
  await onboard(B, { from: "NVDA", to: "AAPL", fraction: 0.5 }, dir);
  const name = `E2E Pair ${new Date().toISOString().slice(11, 19)}`;
  const circleId = await createCircle(A, name, ["NVDA", "AAPL", "SPY"], dir);
  await joinFromDiscover(B, name, dir);
  const roundA = await enterLobbyAndSign(A, circleId, dir);
  const roundB = await enterLobbyAndSign(B, circleId, dir);
  if (roundA !== roundB) throw new Error(`users landed in different rounds ${roundA} ${roundB}`);
  console.log("state", await waitState(A.page, roundA, ["PROPOSED", "NO_CROSS", "INSUFFICIENT_PARTICIPANTS", "PLAN_STALE"]));
  await approve(A, roundA, dir);
  await approve(B, roundA, dir);
  await settle(B, roundA, dir);
  await residualAndReceipt(A, roundA, dir);
  await residualAndReceipt(B, roundA, dir);
  console.log(JSON.stringify({ circleId, roundId: roundA }));
} catch (error) {
  await A.page.screenshot({ path: `${dir}/FAIL-A.png` });
  await B.page.screenshot({ path: `${dir}/FAIL-B.png` });
  throw error;
} finally {
  await A.context.close();
  await B.context.close();
}
