import { BASE, openUser } from "./session.ts";
import { onboard } from "./steps.ts";

/**
 * Against a fresh database: onboard A, B, C through the product, then race one single-use invite. A creates an
 * invite-only circle and one invite; B and C each try to redeem the same code five times at once.
 */
const dir = process.argv[2] as string;
const A = await openUser("A", dir);
const B = await openUser("B", dir);
const C = await openUser("C", dir);
try {
  await onboard(A, { from: "NVDA", to: "SPY", fraction: 0.5 }, dir);
  await onboard(B, { from: "NVDA", to: "AAPL", fraction: 0.5 }, dir);
  await onboard(C, { from: "SPY", to: "NVDA", fraction: 0.9 }, dir);
  const assets = (await (await A.page.request.get(`${BASE}/api/me/target`)).json()).target.weights.map((w: { uid: string }) => w.uid);
  const { circle } = await (await A.page.request.post(`${BASE}/api/circles`, { data: { name: `PG Invite ${Date.now() % 100000}`, description: "", visibility: "INVITE_ONLY", assetUids: assets, minParticipants: 2, cadenceSec: null, durationSec: 900, residualBehavior: "ECONOMIC", privacyMode: "DELTAS_ONLY" } })).json();
  const { code } = await (await A.page.request.post(`${BASE}/api/circles/${circle.id}/invite`)).json();
  const attempts = await Promise.all([...Array(5)].flatMap(() => [B, C].map(async (u) => ({ who: u.label, status: (await u.page.request.post(`${BASE}/api/circles/${circle.id}/join`, { data: { invite: code } })).status() }))));
  const joined = new Set(attempts.filter((a) => a.status === 200).map((a) => a.who));
  const members = (await (await A.page.request.get(`${BASE}/api/circles`)).json()).mine.find((c: { id: string }) => c.id === circle.id).memberCount;
  console.log(`${joined.size === 1 && members === 2 ? "PASS" : "FAIL"} one invite raced by B and C x5: joined=${[...joined]} members=${members} statuses=${attempts.map((a) => `${a.who}${a.status}`).join(",")}`);
  const outsider = await C.page.request.post(`${BASE}/api/circles/${circle.id}/join`, { data: { invite: "not-a-code" } });
  console.log(`${joined.has("C") || outsider.status() === 409 ? "PASS" : "FAIL"} bad invite code refused: ${outsider.status()}`);
} finally {
  for (const u of [A, B, C]) await u.context.close();
}
