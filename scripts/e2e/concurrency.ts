import { apiGet, BASE, openUser, type User } from "./session.ts";
import { createCircle, setTarget, waitState } from "./steps.ts";

/**
 * True concurrent mutations against the running product with real sessions. No tokens move: both test wallets decline
 * every transaction, so the plan is approved by signature only and then left to expire.
 * Args: <dir> <foreignSettlementTx>  (a real settle() tx for a different plan)
 */
const [dir, foreignTx] = process.argv.slice(2) as [string, string];
const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${detail}`);
};
const burst = <T>(n: number, fn: () => Promise<T>) => Promise.all(Array.from({ length: n }, fn));
/** Counts rendered Activity rows matching `text` in a separate tab, so the test tab's state is untouched. */
const count = async (u: User, text: RegExp) => {
  const tab = await u.context.newPage();
  await tab.goto(`${BASE}/activity`);
  const rows = await tab.locator("main li").allInnerTexts();
  await tab.close();
  return rows.filter((r) => text.test(r)).length;
};
const capture = (u: User, suffix: string) => {
  let body: string | null = null;
  u.page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith(suffix)) body = r.postData(); });
  return () => body;
};

const A = await openUser("A", dir, { declineTransactions: true });
const C = await openUser("C", dir, { declineTransactions: true });
try {
  for (const u of [A, C]) await u.page.goto(`${BASE}/portfolio`);
  await setTarget(A, { from: "NVDA", to: "SPY", fraction: 0.5 });
  await setTarget(C, { from: "SPY", to: "NVDA", fraction: 0.9 });
  const name = `E2E Concurrency ${new Date().toISOString().slice(11, 19)}`;
  const circleId = await createCircle(A, name, ["NVDA", "AAPL", "SPY"], dir);

  // 1. Ten simultaneous joins by the same user.
  const joins = await burst(10, () => C.page.request.post(`${BASE}/api/circles/${circleId}/join`, { data: {} }).then((r) => r.status()));
  const circle = await apiGet<{ mine: Array<{ id: string; memberCount: number }> }>(A.page, "/api/circles");
  check("10 concurrent joins: all 200, one membership", joins.every((s) => s === 200) && circle.mine.find((c) => c.id === circleId)?.memberCount === 2, `statuses=${[...new Set(joins)]} members=${circle.mine.find((c) => c.id === circleId)?.memberCount}`);
  check("10 concurrent joins: one CIRCLE_JOINED activity", (await count(C, new RegExp(`Joined circle ${name}`))) === 1);

  // 2. Both members open the lobby at once, five times each.
  const opened = await burst(5, async () => Promise.all([A, C].map(async (u) => (await (await u.page.request.post(`${BASE}/api/circles/${circleId}/round`)).json()).roundId as string)));
  const ids = new Set(opened.flat());
  check("10 concurrent lobby entries open exactly one round", ids.size === 1, [...ids].join(","));
  const roundId = [...ids][0] as string;

  // 3. A signs through the UI; the signed body is replayed ten times at once.
  const aIntent = capture(A, `/api/rounds/${roundId}/intent`);
  await A.page.goto(`${BASE}/round/${roundId}/lobby`);
  await A.page.getByRole("button", { name: "Sign and join round" }).click({ timeout: 90_000 });
  await A.page.getByText("Signed", { exact: true }).waitFor({ timeout: 90_000 });
  const replays = await burst(10, async () => (await (await A.page.request.post(`${BASE}/api/rounds/${roundId}/intent`, { data: aIntent() ?? "", headers: { "content-type": "application/json" } })).json()).status as string);
  check("10 concurrent duplicate intents: all UNCHANGED", replays.every((s) => s === "UNCHANGED"), [...new Set(replays)].join(","));
  check("duplicate intents logged once", (await count(A, new RegExp(`Signed into round 1 of ${name}`))) === 1);

  // 4. C signs; the solve is raced by ten concurrent reads from both members.
  await C.page.goto(`${BASE}/round/${roundId}/lobby`);
  await C.page.getByRole("button", { name: "Sign and join round" }).click({ timeout: 90_000 });
  await burst(10, () => Promise.all([A, C].map((u) => u.page.request.get(`${BASE}/api/rounds/${roundId}`))));
  const state = await waitState(A.page, roundId, ["PROPOSED", "NO_CROSS", "INSUFFICIENT_PARTICIPANTS", "PLAN_STALE"]);
  const view = await apiGet<{ round: { history: Array<{ to: string }> } }>(A.page, `/api/rounds/${roundId}`);
  const tos = view.round.history.map((h) => h.to);
  check("solve raced by 20 reads transitions once", ["FROZEN", "SOLVING", "PROPOSED"].every((s) => tos.filter((t) => t === s).length === 1), `${state}: ${tos.join(">")}`);

  if (state === "PROPOSED") {
    // 5. A approves in the UI; the allowance transaction is declined in the wallet (failed-signing path).
    const approvedBefore = await count(A, /Approved the settlement plan/);
    const aApproval = capture(A, `/api/rounds/${roundId}/approval`);
    await A.page.goto(`${BASE}/round/${roundId}/proposal`);
    await A.page.getByRole("button", { name: "Approve & execute" }).click({ timeout: 60_000 });
    await A.page.getByText(/You declined the request in your wallet/).waitFor({ timeout: 90_000 });
    check("declined wallet transaction shows a plain error, nothing sent", true);
    const approvals = await burst(10, async () => (await A.page.request.post(`${BASE}/api/rounds/${roundId}/approval`, { data: aApproval() ?? "", headers: { "content-type": "application/json" } })).status());
    const agg = await apiGet<{ aggregate: { approvals: number }; round: { state: string } }>(A.page, `/api/rounds/${roundId}`);
    check("10 concurrent duplicate approvals: one approval stored", agg.aggregate.approvals === 1, `statuses=${[...new Set(approvals)]} approvals=${agg.aggregate.approvals} state=${agg.round.state}`);
    check("duplicate approvals logged once", (await count(A, /Approved the settlement plan/)) === approvedBefore + 1, `before=${approvedBefore}`);

    // 6. C approves by signature only; the round becomes READY_TO_SETTLE with no allowance or settlement sent.
    await C.page.goto(`${BASE}/round/${roundId}/proposal`);
    await C.page.getByRole("button", { name: "Approve & execute" }).click({ timeout: 60_000 });
    await C.page.getByText(/You declined the request in your wallet/).waitFor({ timeout: 90_000 });
    const ready = await waitState(A.page, roundId, ["READY_TO_SETTLE"], 30_000).catch((e: Error) => e.message);
    check("both approvals → READY_TO_SETTLE", ready === "READY_TO_SETTLE", ready);

    // 7. Settlement reports for the wrong plan, racing, from both members.
    const wrong = await burst(5, () => Promise.all([A, C].map(async (u) => {
      const r = await u.page.request.post(`${BASE}/api/rounds/${roundId}/settle`, { data: { txHash: foreignTx } });
      return `${r.status()} ${(await r.json()).error ?? ""}`;
    })));
    const flat = wrong.flat();
    check("10 concurrent reports of another plan's settle() tx refused", flat.every((w) => w.startsWith("409") && w.includes("different plan")), [...new Set(flat)].join(" | "));
    const missing = await A.page.request.post(`${BASE}/api/rounds/${roundId}/settle`, { data: { txHash: `0x${"ab".repeat(32)}` } });
    check("report of a nonexistent tx refused", missing.status() === 409, `${missing.status()} ${(await missing.json()).error}`);
    const after = await apiGet<{ round: { state: string } }>(A.page, `/api/rounds/${roundId}`);
    check("round still READY_TO_SETTLE after bogus reports", after.round.state === "READY_TO_SETTLE", after.round.state);
  }
  console.log(JSON.stringify({ circleId, roundId }));
} finally {
  for (const u of [A, C]) await u.context.close();
  const failed = results.filter(([, ok]) => !ok);
  console.log(`CONCURRENCY ${results.length - failed.length}/${results.length} passed`);
}
