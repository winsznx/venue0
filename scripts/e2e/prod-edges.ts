/// <reference lib="dom" />
import { apiGet, BASE, dynamicLogin, openUser, type User } from "./session.ts";

/** Auth, authorization and invite-race checks on the public deployment. Args: <dir> <roundIdWithABC> */
const [dir, round] = process.argv.slice(2) as [string, string];
const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${detail}`);
};
/** Loads the app, lets Dynamic's SDK settle (it may end an expired session), then signs in only if no session remains. */
const ensureSignedIn = async (u: User) => {
  await u.page.goto(`${BASE}/app`);
  await u.page.waitForTimeout(8_000);
  if ((await apiGet<{ user: unknown }>(u.page, "/api/session")).user) return;
  await u.page.goto(`${BASE}/onboarding`);
  console.log(`[${u.label}] session ended; signing in again`);
  await u.page.getByRole("button", { name: "Get started" }).click();
  await dynamicLogin(u);
};

const [A, B, C] = await Promise.all((["A", "B", "C"] as const).map((l) => openUser(l, dir, { profile: `prod-${l}` })));
try {
  for (const u of [A, B, C]) await ensureSignedIn(u as User);
  const a = A as User, b = B as User, c = C as User;

  const cookie = (await a.context.cookies(BASE)).find((k) => k.name === "venue0_session");
  check("session cookie is HttpOnly, Secure, SameSite=Lax on HTTPS", Boolean(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Lax"), JSON.stringify({ httpOnly: cookie?.httpOnly, secure: cookie?.secure, sameSite: cookie?.sameSite }));
  const sessions = await Promise.all([a, b, c].map(async (u) => (await apiGet<{ user: { address: string } | null }>(u.page, "/api/session")).user?.address.toLowerCase()));
  check("three profiles hold three different wallets", new Set(sessions).size === 3 && sessions.every((s, i) => s === [a, b, c][i]?.wallet.address.toLowerCase()), sessions.join(","));

  const token = await a.page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      const m = (localStorage.getItem(k) ?? "").match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/);
      if (m) return m[0];
    }
    return null;
  });
  const forged = await c.page.request.post(`${BASE}/api/session`, { data: { token, address: b.wallet.address } });
  check("forged association (A's Dynamic JWT + B's wallet) rejected", Boolean(token) && forged.status() === 401, `${forged.status()} ${(await forged.json()).error}`);
  const junk = await c.page.request.post(`${BASE}/api/session`, { data: { token: "eyJhbGciOiJSUzI1NiJ9.e30.x", address: c.wallet.address } });
  check("invalid token rejected", junk.status() === 401, `${junk.status()}`);
  check("C still signed in as C after both attempts", (await apiGet<{ user: { address: string } | null }>(c.page, "/api/session")).user?.address.toLowerCase() === c.wallet.address.toLowerCase());

  const anon = await (await a.context.browser()?.newContext())?.request.get(`${BASE}/api/rounds/${round}`);
  check("anonymous round read rejected", anon?.status() === 401, `${anon?.status()}`);
  const bResponse = await b.page.request.get(`${BASE}/api/rounds/${round}`);
  const bView = await bResponse.text();
  check("B's view of the shared round contains neither A's nor C's address", bResponse.status() === 200 && bView.includes('"legs"') && ![a, c].some((u) => bView.toLowerCase().includes(u.wallet.address.toLowerCase().slice(2))), `status=${bResponse.status()}`);

  const assets = (await apiGet<{ target: { weights: Array<{ uid: string }> } }>(a.page, "/api/me/target")).target.weights.map((w) => w.uid);
  const { circle } = await (await a.page.request.post(`${BASE}/api/circles`, { data: { name: `Prod Invite ${Date.now() % 100000}`, description: "", visibility: "INVITE_ONLY", assetUids: assets, minParticipants: 2, cadenceSec: null, durationSec: 900, residualBehavior: "ECONOMIC", privacyMode: "DELTAS_ONLY" } })).json();
  const bPeek = await b.page.request.get(`${BASE}/api/circles/${circle.id}`);
  const bRound = await b.page.request.post(`${BASE}/api/circles/${circle.id}/round`);
  check("non-member cannot open a round in an invite-only circle", bRound.status() === 409, `${bRound.status()} (circle page ${bPeek.status()})`);
  const { code } = await (await a.page.request.post(`${BASE}/api/circles/${circle.id}/invite`)).json();
  const race = await Promise.all([...Array(5)].flatMap(() => [b, c].map(async (u) => ({ who: u.label, status: (await u.page.request.post(`${BASE}/api/circles/${circle.id}/join`, { data: { invite: code } })).status() }))));
  const winners = new Set(race.filter((r) => r.status === 200).map((r) => r.who));
  const members = (await apiGet<{ mine: Array<{ id: string; memberCount: number }> }>(a.page, "/api/circles")).mine.find((x) => x.id === circle.id)?.memberCount;
  check("one single-use invite raced by B and C x5 admits exactly one", winners.size === 1 && members === 2, `winner=${[...winners]} members=${members} statuses=${race.map((r) => `${r.who}${r.status}`).join(",")}`);
  const loser = [b, c].find((u) => !winners.has(u.label)) as User;
  const reuse = await loser.page.request.post(`${BASE}/api/circles/${circle.id}/join`, { data: { invite: code } });
  check("used invite refused afterwards", reuse.status() === 409, `${reuse.status()} ${(await reuse.json()).error}`);

  await a.page.goto(`${BASE}/settings`);
  await a.page.getByRole("button", { name: "Disconnect wallet" }).click();
  await a.page.waitForURL(/onboarding/, { timeout: 30_000 });
  check("sign out clears the server session", (await apiGet<{ user: unknown }>(a.page, "/api/session")).user === null);
  check("signed-out API call rejected", (await a.page.request.get(`${BASE}/api/me/target`)).status() === 401);
  await a.page.getByRole("button", { name: "Get started" }).click();
  await dynamicLogin(a);
  await a.page.goto(`${BASE}/app`);
  check("sign back in lands on home", a.page.url().endsWith("/app"), a.page.url());
  await a.page.reload();
  check("refresh keeps the session", a.page.url().endsWith("/app"));

  const fresh = await openUser("A", dir, { profile: `prod-fresh-${Date.now()}` });
  await fresh.page.goto(`${BASE}/app`);
  check("fresh profile is not signed in and lands on onboarding", fresh.page.url().includes("/onboarding"));
  await fresh.context.close();
} finally {
  for (const u of [A, B, C]) await (u as User).context.close();
  const failed = results.filter(([, ok]) => !ok);
  console.log(`PROD-EDGES ${results.length - failed.length}/${results.length} passed`);
}
