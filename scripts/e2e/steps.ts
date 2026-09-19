/// <reference lib="dom" />
import type { Page } from "playwright-core";
import { apiGet, BASE, dynamicLogin, shot, type User } from "./session.ts";

type Position = { symbol: string; valueUsd: number };
export type Shift = { from: string; to: string; fraction: number };

const log = (u: User, msg: string) => console.log(`[${u.label}] ${msg}`);

/** Steps 1-8: fresh landing, Enter Venue0, Dynamic auth, onboarding with a structured target. */
export async function onboard(u: User, shift: Shift, dir: string) {
  const { page } = u;
  await page.goto(`${BASE}/`);
  await page.getByRole("link", { name: "Enter Venue0" }).first().click();
  await page.waitForURL(/onboarding/);
  await page.getByRole("button", { name: "Get started" }).click();
  await dynamicLogin(u);
  const session = await apiGet<{ user: { address: string; dynamicUserId: string } }>(page, "/api/session");
  if (session.user.address.toLowerCase() !== u.wallet.address.toLowerCase()) throw new Error(`${u.label}: server wallet ${session.user.address} != injected ${u.wallet.address}`);
  log(u, `server session wallet=${session.user.address} dynamicUser=${session.user.dynamicUserId.slice(0, 8)}…`);
  const chain = await page.evaluate(() => (window as unknown as { ethereum: { request: (a: { method: string }) => Promise<string> } }).ethereum.request({ method: "eth_chainId" }));
  log(u, `wallet chainId=${parseInt(chain, 16)}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Set my target" }).waitFor({ timeout: 60_000 });
  await shot(page, dir, `${u.label}-1-portfolio`);
  await page.getByRole("button", { name: "Set my target" }).click();
  await setTarget(u, shift);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Find a Circle" }).waitFor();
  await page.waitForFunction(() => !document.querySelector("button[disabled]")?.textContent?.includes("Find a Circle"));
  await shot(page, dir, `${u.label}-2-ready`);
}

/** Moves `fraction` of the `from` position into `to`, entered through the structured target editor. */
export async function setTarget(u: User, shift: Shift) {
  const { page } = u;
  const portfolio = await apiGet<{ ok: boolean; positions: Position[]; totalUsd: number }>(page, "/api/me/portfolio");
  const total = portfolio.totalUsd;
  const weights = new Map(portfolio.positions.map((p) => [p.symbol, (p.valueUsd / total) * 100]));
  const moved = (weights.get(shift.from) ?? 0) * shift.fraction;
  weights.set(shift.from, (weights.get(shift.from) ?? 0) - moved);
  weights.set(shift.to, (weights.get(shift.to) ?? 0) + moved);
  log(u, `portfolio $${total.toFixed(2)} ${portfolio.positions.map((p) => `${p.symbol} $${p.valueUsd.toFixed(2)}`).join(", ")}; target ${[...weights].map(([s, w]) => `${s} ${w.toFixed(1)}%`).join(", ")}`);
  await page.getByRole("button", { name: "Set weights" }).click();
  while (await page.getByRole("button", { name: /^Remove/ }).count()) await page.getByRole("button", { name: /^Remove/ }).first().click();
  // Entered at 0.1% precision; the last row takes the remainder so the total is exactly 100%.
  const entries = [...weights].map(([symbol, w]) => [symbol, Math.floor(w * 10) / 10] as const);
  const rest = Math.round((100 - entries.slice(0, -1).reduce((sum, [, w]) => sum + w, 0)) * 10) / 10;
  for (const [i, [symbol, w]] of entries.entries()) {
    await page.getByRole("button", { name: "Add a Stock Token" }).click();
    await page.locator(`#sym-${i}`).fill(symbol);
    await page.locator(`#pct-${i}`).fill((i === entries.length - 1 ? rest : w).toFixed(1));
  }
  await page.getByRole("button", { name: "Check this target" }).click();
  const save = page.getByRole("button", { name: "Save target" });
  const problem = page.locator("main p[role=alert], main [aria-live=polite] li");
  await save.or(problem).first().waitFor({ timeout: 60_000 });
  if (!(await save.count())) throw new Error(`${u.label}: target check refused: ${(await problem.allInnerTexts()).join(" | ")}`);
  await save.click();
  await page.getByText(/^Saved /).waitFor({ timeout: 30_000 });
  log(u, "target saved");
}

export async function createCircle(u: User, name: string, symbols: string[], dir: string): Promise<string> {
  const { page } = u;
  await page.goto(`${BASE}/circles/new`);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Description").fill("Operator-controlled end-to-end test circle.");
  for (const s of symbols) {
    await page.getByLabel("Filter Stock Tokens").fill(s);
    const pill = page.locator("label", { hasText: new RegExp(`^${s}$`) });
    if (!(await pill.getAttribute("class"))?.includes("pickOn")) await pill.click();
  }
  await page.getByLabel("Filter Stock Tokens").fill("");
  await page.getByLabel("How long each round collects").selectOption("900");
  await page.getByRole("button", { name: "Create Circle" }).click();
  await page.waitForURL(/\/circles\/0x/);
  await shot(page, dir, `${u.label}-3-circle`);
  const id = page.url().split("/circles/")[1]?.split("?")[0] as string;
  log(u, `created circle ${id}`);
  return id;
}

export async function joinFromDiscover(u: User, name: string, dir: string) {
  const { page } = u;
  await page.goto(`${BASE}/circles`);
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: "Join Circle" }).click();
  await page.getByRole("button", { name: "Enter round lobby" }).waitFor({ timeout: 30_000 });
  await shot(page, dir, `${u.label}-4-joined`);
  log(u, "joined circle via Discover");
}

export async function enterLobbyAndSign(u: User, circleId: string, dir: string): Promise<string> {
  const { page } = u;
  await page.goto(`${BASE}/circles/${circleId}`);
  await page.getByRole("button", { name: "Enter round lobby" }).click();
  await page.waitForURL(/\/round\/0x.*\/lobby/, { timeout: 90_000 });
  const roundId = page.url().split("/round/")[1]?.split("/")[0] as string;
  await page.getByRole("button", { name: "Sign and join round" }).click({ timeout: 90_000 });
  await page.getByText("Signed", { exact: true }).waitFor({ timeout: 90_000 });
  await shot(page, dir, `${u.label}-5-signed`);
  log(u, `signed intent into round ${roundId}`);
  return roundId;
}

export async function waitState(page: Page, roundId: string, states: string[], timeoutMs = 180_000) {
  const start = Date.now();
  for (;;) {
    const v = await apiGet<{ round: { state: string } }>(page, `/api/rounds/${roundId}`);
    if (states.includes(v.round.state)) return v.round.state;
    if (Date.now() - start > timeoutMs) throw new Error(`round stuck in ${v.round.state}, wanted ${states.join("/")}`);
    await page.waitForTimeout(3_000);
  }
}

export async function approve(u: User, roundId: string, dir: string) {
  const { page } = u;
  await page.goto(`${BASE}/round/${roundId}`);
  await page.getByRole("heading", { name: /Your result/ }).waitFor({ timeout: 60_000 });
  await shot(page, dir, `${u.label}-6-match`);
  await page.goto(`${BASE}/round/${roundId}/proposal`);
  await page.getByRole("button", { name: "Approve & execute" }).click({ timeout: 60_000 });
  await page.waitForURL(/\/execute/, { timeout: 180_000 });
  log(u, "approved plan and set exact allowance");
}

export async function settle(u: User, roundId: string, dir: string) {
  const { page } = u;
  await page.goto(`${BASE}/round/${roundId}/execute`);
  await page.getByRole("button", { name: "Send settlement" }).click({ timeout: 120_000 });
  await waitState(page, roundId, ["COMPLETE", "VERIFICATION_FAILED", "SETTLEMENT_REVERTED"], 240_000);
  await page.reload();
  await page.getByText(/checks passed/).waitFor({ timeout: 60_000 });
  await shot(page, dir, `${u.label}-7-executed`);
  log(u, "sent settlement");
}

/** Residual through the product UI: carries forward (no extra spend); the engine's suggestion is logged. */
export async function residualAndReceipt(u: User, roundId: string, dir: string) {
  const { page } = u;
  await page.goto(`${BASE}/round/${roundId}/execute`);
  await page.getByText(/What's left over|Everything you asked for crossed|rounding dust|Leftovers/).first().waitFor({ timeout: 90_000 });
  await page.getByRole("button", { name: "Carry into the next round" }).or(page.getByText(/Everything you asked for crossed|rounding dust|Carried into/)).first().waitFor({ timeout: 90_000 });
  const carry = page.getByRole("button", { name: "Carry into the next round" });
  if (await carry.count()) {
    const suggestion = await page.getByText(/Venue0 suggests/).textContent().catch(() => null);
    log(u, `residual present; ${suggestion ?? "no suggestion"}; choosing carry forward`);
    await carry.click();
    await page.getByText(/Carried into the next round/).waitFor({ timeout: 30_000 });
  } else {
    log(u, `residual: ${(await page.getByText(/Everything you asked for crossed|rounding dust/).textContent().catch(() => "none shown")) ?? ""}`);
  }
  await page.goto(`${BASE}/round/${roundId}/receipt`);
  await page.getByText("Verified onchain").waitFor({ timeout: 60_000 });
  await shot(page, dir, `${u.label}-8-receipt`);
  await page.goto(`${BASE}/activity`);
  await page.getByText(/Settled and verified onchain/).first().waitFor({ timeout: 30_000 });
  await shot(page, dir, `${u.label}-9-activity`);
  log(u, "receipt verified and activity shows settlement");
}
