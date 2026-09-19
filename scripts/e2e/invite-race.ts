import { apiGet, BASE, openUser, type User } from "./session.ts";
/** Races one single-use invite: B and C each redeem it N times at once. Prints every status. Args: <dir> <n> */
const [dir, n = "5"] = process.argv.slice(2) as [string, string];
const users = await Promise.all((["A", "B", "C"] as const).map((l) => openUser(l, dir, { profile: `prod-${l}` })));
const [A, B, C] = users as [User, User, User];
const assets = (await apiGet<{ target: { weights: Array<{ uid: string }> } }>(A.page, "/api/me/target")).target.weights.map((w) => w.uid);
const { circle } = await (await A.page.request.post(`${BASE}/api/circles`, { data: { name: `Race ${Date.now() % 100000}`, description: "", visibility: "INVITE_ONLY", assetUids: assets, minParticipants: 2, cadenceSec: null, durationSec: 900, residualBehavior: "ECONOMIC", privacyMode: "DELTAS_ONLY" } })).json();
const { code } = await (await A.page.request.post(`${BASE}/api/circles/${circle.id}/invite`)).json();
const out = await Promise.all([...Array(Number(n))].flatMap(() => [B, C].map(async (u) => {
  const t = performance.now();
  try {
    const r = await u.page.request.post(`${BASE}/api/circles/${circle.id}/join`, { data: { invite: code }, timeout: 120_000 });
    return `${u.label}${r.status()}/${Math.round(performance.now() - t)}ms${r.status() >= 500 ? `:${(await r.json()).error}` : ""}`;
  } catch (error) {
    return `${u.label}TIMEOUT/${Math.round(performance.now() - t)}ms:${(error as Error).message.split("\n")[0]}`;
  }
})));
console.log(out.join(" | "));
for (const u of [A, B, C]) await u.context.close();
