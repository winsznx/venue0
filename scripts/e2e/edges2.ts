import { apiGet, BASE, dynamicLogin, openUser } from "./session.ts";

const dir = process.argv[2] as string;
// Wrong OTP in a fresh profile: Dynamic must refuse and the server must hold no session.
const W = await openUser("B", dir, { profile: "B-wrong-otp" });
await W.page.goto(`${BASE}/onboarding`);
await W.page.getByRole("button", { name: "Get started" }).click();
const wrong = await dynamicLogin(W, "000000").then(() => "LOGGED IN", (e: Error) => e.message.slice(0, 160));
const s = await apiGet<{ user: unknown }>(W.page, "/api/session");
console.log(`${s.user === null && wrong !== "LOGGED IN" ? "PASS" : "FAIL"} wrong verification code refused (${wrong}); server session=${JSON.stringify(s.user)}`);
await W.context.close();

// Expired round: nobody signs before a 2-minute window closes.
const A = await openUser("A", dir);
await A.page.goto(`${BASE}/app`);
const assets = (await apiGet<{ mine: Array<{ assetUids: string[] }> }>(A.page, "/api/circles")).mine[0]?.assetUids ?? [];
const created = await (await A.page.request.post(`${BASE}/api/circles`, { data: { name: `E2E Expiry ${Date.now() % 100000}`, description: "", visibility: "PRIVATE", assetUids: assets, minParticipants: 2, cadenceSec: null, durationSec: 120, residualBehavior: "ECONOMIC", privacyMode: "DELTAS_ONLY" } })).json();
const { roundId } = await (await A.page.request.post(`${BASE}/api/circles/${created.circle.id}/round`)).json();
await A.page.waitForTimeout(128_000);
const r = await apiGet<{ round: { state: string } }>(A.page, `/api/rounds/${roundId}`);
console.log(`${r.round.state === "EXPIRED" ? "PASS" : "FAIL"} unsigned round expires: ${r.round.state}`);
await A.context.close();
