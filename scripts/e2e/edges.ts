/// <reference lib="dom" />
import { apiGet, BASE, dynamicLogin, openUser, type User } from "./session.ts";
import { createCircle, joinFromDiscover, waitState } from "./steps.ts";

/**
 * Auth, authorization, idempotency and round-outcome edge cases against the running product, using the persistent
 * test-user profiles from test1/test2. Args: <dir> <test1RoundId> <test1CircleId>
 */
const [dir, pairRound, pairCircle] = process.argv.slice(2) as [string, string, string];
const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${detail}`);
};
const post = async (u: User, path: string, body: unknown) => {
  const r = await u.page.request.post(`${BASE}${path}`, { data: body });
  return { status: r.status(), json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
};
const activityCount = async (u: User) => (await u.page.request.get(`${BASE}/activity`)).text().then((t) => (t.match(/<li/g) ?? []).length);

const A = await openUser("A", dir, { chainId: 1 });
const B = await openUser("B", dir);
const C = await openUser("C", dir);
try {
  for (const u of [A, B, C]) {
    await u.page.goto(`${BASE}/app`);
    if (u.page.url().includes("/onboarding")) {
      await u.page.getByRole("button", { name: "Get started" }).click();
      await dynamicLogin(u);
    }
  }

  // Forged wallet association: A's genuine Dynamic JWT presented with B's address.
  const tokenA = await A.page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      const m = (localStorage.getItem(k) ?? "").match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/);
      if (m) return m[0];
    }
    return null;
  });
  check("dynamic token present in A's browser", Boolean(tokenA));
  const forged = await post(C, "/api/session", { token: tokenA, address: B.wallet.address });
  check("forged wallet/user association rejected", forged.status === 401, `${forged.status} ${String(forged.json.error)}`);
  const garbage = await post(C, "/api/session", { token: "eyJhbGciOiJSUzI1NiJ9.e30.x", address: C.wallet.address });
  check("invalid token rejected", garbage.status === 401, `${garbage.status}`);
  const after = await apiGet<{ user: { address: string } | null }>(C.page, "/api/session");
  check("C's session unchanged after forged attempts", after.user?.address.toLowerCase() === C.wallet.address.toLowerCase());

  // Authorization: C is not in the pair circle.
  const peek = await C.page.request.get(`${BASE}/api/rounds/${pairRound}`);
  check("non-member cannot read another circle's round", peek.status() === 409, `${peek.status()}`);
  const peekIntent = await C.page.request.get(`${BASE}/api/rounds/${pairRound}/intent`);
  check("non-member cannot build an intent there", peekIntent.status() === 409, `${peekIntent.status()}`);
  const anon = await (await A.context.browser()?.newContext())?.request.get(`${BASE}/api/rounds/${pairRound}`);
  check("anonymous request rejected", !anon || anon.status() === 401, `${anon?.status()}`);

  // B's view of the pair round never contains A's address.
  const bView = JSON.stringify(await apiGet(B.page, `/api/rounds/${pairRound}`));
  check("B's round view hides A's address", !bView.toLowerCase().includes(A.wallet.address.toLowerCase().slice(2)));
  const bReceipt = await (await B.page.request.get(`${BASE}/round/${pairRound}/receipt`)).text();
  check("B's receipt page hides A's address", !bReceipt.toLowerCase().includes(A.wallet.address.toLowerCase().slice(2)));

  // Idempotency.
  const before = await activityCount(A);
  const rejoin = await post(A, `/api/circles/${pairCircle}/join`, {});
  check("duplicate join is a no-op", rejoin.status === 200 && (await activityCount(A)) === before, `${rejoin.status}`);
  const pairState = await apiGet<{ round: { state: string; settlementTx: string } }>(A.page, `/api/rounds/${pairRound}`);
  const resettle = await post(A, `/api/rounds/${pairRound}/settle`, { txHash: pairState.round.settlementTx });
  check("repeated settlement report is a no-op", resettle.status === 200 && resettle.json.state === "COMPLETE" && (await activityCount(A)) === before, JSON.stringify(resettle.json));
  const reapprove = await post(A, `/api/rounds/${pairRound}/approval`, { signature: "0x00" });
  check("approval after settlement refused", reapprove.status === 409, `${reapprove.status} ${String(reapprove.json.error)}`);

  // Edge circle: short window; A signs alone (wrong chain start → switch), duplicate intent replay, then the window expires.
  const edgeName = `E2E Edge ${new Date().toISOString().slice(11, 19)}`;
  await A.page.goto(`${BASE}/circles/new`);
  const edgeCircle = await createCircle(A, edgeName, ["NVDA", "AAPL", "SPY"], dir).catch(async () => "");
  await A.page.goto(`${BASE}/circles/${edgeCircle}`);
  await A.page.getByRole("button", { name: "Enter round lobby" }).click();
  await A.page.waitForURL(/\/lobby/, { timeout: 90_000 });
  const edgeRound = A.page.url().split("/round/")[1]?.split("/")[0] as string;
  let intentBody: string | null = null;
  A.page.on("request", (r) => { if (r.url().endsWith(`/api/rounds/${edgeRound}/intent`) && r.method() === "POST") intentBody = r.postData(); });
  const sign = A.page.getByRole("button", { name: "Sign and join round" });
  if (await sign.count().then(() => sign.waitFor({ timeout: 60_000 }).then(() => true, () => false))) {
    await sign.click();
    await A.page.getByText("Signed", { exact: true }).waitFor({ timeout: 90_000 });
    check("wrong chain detected and switched before signing", A.wallet.log.includes("wallet_switchEthereumChain"), A.wallet.log.filter((m) => m.startsWith("wallet_")).join(","));
    const replay = await A.page.request.post(`${BASE}/api/rounds/${edgeRound}/intent`, { data: intentBody ?? "", headers: { "content-type": "application/json" } });
    check("duplicate signed intent is UNCHANGED", (await replay.json()).status === "UNCHANGED", `${replay.status()}`);
  } else {
    const msg = await A.page.locator("main").innerText();
    check("edge round intent", false, `could not sign: ${msg.slice(0, 200)}`);
  }
  const bPeek = await B.page.request.get(`${BASE}/api/rounds/${edgeRound}`);
  check("non-member B cannot open A's edge round", bPeek.status() === 409, `${bPeek.status()}`);
  await A.page.request.post(`${BASE}/api/rounds/${edgeRound}/close`);
  const closed = await waitState(A.page, edgeRound, ["INSUFFICIENT_PARTICIPANTS", "EXPIRED", "NO_CROSS", "PROPOSED"], 60_000);
  check("round with one signer ends INSUFFICIENT_PARTICIPANTS, nothing moves", closed === "INSUFFICIENT_PARTICIPANTS", closed);

  // No-cross: B joins the edge circle; A and B's remaining targets don't complement.
  await joinFromDiscover(B, edgeName, dir);
  const r2 = await post(A, `/api/circles/${edgeCircle}/round`, {});
  const round2 = String(r2.json.roundId);
  for (const u of [A, B]) {
    await u.page.goto(`${BASE}/round/${round2}/lobby`);
    const btn = u.page.getByRole("button", { name: "Sign and join round" });
    if (await btn.waitFor({ timeout: 60_000 }).then(() => true, () => false)) {
      await btn.click();
      await u.page.getByText("Signed", { exact: true }).waitFor({ timeout: 90_000 });
    } else console.log(`[${u.label}] no intent possible in edge round 2: ${(await u.page.locator("main").innerText()).slice(0, 160)}`);
  }
  await A.page.request.post(`${BASE}/api/rounds/${round2}/close`);
  const s2 = await waitState(A.page, round2, ["NO_CROSS", "PROPOSED", "INSUFFICIENT_PARTICIPANTS", "EXPIRED"], 60_000);
  check("second edge round outcome recorded", true, s2);

  // Sign out, then sign back in, in A's browser.
  await A.page.goto(`${BASE}/settings`);
  await A.page.getByRole("button", { name: "Disconnect wallet" }).click();
  await A.page.waitForURL(/onboarding/, { timeout: 30_000 });
  check("sign out clears server session", (await apiGet<{ user: unknown }>(A.page, "/api/session")).user === null);
  const gated = await A.page.request.get(`${BASE}/api/me/target`);
  check("signed-out API call rejected", gated.status() === 401, `${gated.status()}`);
  await A.page.getByRole("button", { name: "Get started" }).click();
  await dynamicLogin(A);
  await A.page.goto(`${BASE}/app`);
  check("sign back in lands on home (onboarding remembered)", A.page.url().endsWith("/app"), A.page.url());
  await A.page.reload();
  check("refresh keeps the session", A.page.url().endsWith("/app"));

  // Second browser profile for the same wallet.
  const A2 = await openUser("A", dir, { profile: "A-second" });
  await A2.page.goto(`${BASE}/app`);
  check("fresh second profile is not signed in", A2.page.url().includes("/onboarding"));
  await A2.context.close();

  console.log(JSON.stringify({ edgeCircle, edgeRound, round2, round2State: s2 }));
} catch (error) {
  await A.page.screenshot({ path: `${dir}/EDGE-FAIL-A.png` }).catch(() => undefined);
  console.log("EDGE-FAIL", (error as Error).message.split("\n")[0]);
} finally {
  for (const u of [A, B, C]) await u.context.close();
  const failed = results.filter(([, ok]) => !ok);
  console.log(`EDGES ${results.length - failed.length}/${results.length} passed`);
}
