import { chromium, type BrowserContext, type Page } from "playwright-core";
import type { Hex } from "viem";
import { installWallet } from "./wallet-bridge.ts";

export const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
export const OTP = process.env.DYNAMIC_TEST_OTP ?? "";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** One operator-controlled test user: its own persistent browser profile, its own injected funded wallet. */
export async function openUser(label: "A" | "B" | "C", profileRoot: string, opts: { profile?: string; chainId?: number; declineTransactions?: boolean } = {}) {
  const context = await chromium.launchPersistentContext(`${profileRoot}/profile-${opts.profile ?? `${process.env.E2E_PROFILE_PREFIX ?? ""}${label}`}`, { executablePath: CHROME, headless: true, viewport: { width: 1360, height: 900 } });
  const wallet = await installWallet(context, process.env[`VENUE0_WALLET_${label}_PRIVATE_KEY`] as Hex, { name: `Venue0 Test Wallet ${label}`, rpcUrl: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com", ...(opts.chainId ? { chainId: opts.chainId } : {}), ...(opts.declineTransactions ? { declineTransactions: true } : {}) });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("response", async (r) => {
    if (r.url().includes("dynamicauth") && r.status() >= 400) console.log(`[${label} dynamic ${r.status()}] ${r.url().split("/api/v0")[1] ?? r.url()} ${(await r.text().catch(() => "")).slice(0, 300)}`);
  });
  page.on("console", (m) => { if (m.type() === "error") console.log(`[${label} console] ${m.text().slice(0, 400)}`); });
  page.on("pageerror", (e) => console.log(`[${label} pageerror]`, e.message.slice(0, 200)));
  return { label, context, page, wallet, email: `venue0+${label.toLowerCase()}+dynamic_test@example.com` };
}

export type User = Awaited<ReturnType<typeof openUser>>;

/** Real Dynamic flow: pick the injected wallet, sign SIWE, then verify the test email with the static OTP. */
export async function dynamicLogin(u: User, otp = OTP) {
  const { page } = u;
  // A browser that still holds a Dynamic session is re-verified by the app without opening the modal.
  if (await page.getByText(/Signed in as/).waitFor({ timeout: 8_000 }).then(() => true, () => false)) return;
  if (/\/app$/.test(page.url())) return;
  await page.getByRole("button", { name: /Sign in or create a wallet/ }).click({ timeout: 30_000 });
  await page.getByText(`Venue0 Test Wallet ${u.label}`).click({ timeout: 20_000 });
  let retried = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(2_000);
    if ((await page.getByText(/Signed in as/).count()) || /\/app$/.test(page.url())) return;
    if (await page.getByText("An unexpected error occurred").count()) {
      if (retried) throw new Error(`${u.label}: Dynamic failed twice (check for a 429 rate limit above); not retrying further`);
      retried = true;
      console.log(`[${u.label}] Dynamic returned "unexpected error"; one retry after 20s`);
      await page.waitForTimeout(20_000);
      await page.getByText(`Venue0 Test Wallet ${u.label}`).click().catch(() => undefined);
      continue;
    }
    const email = page.getByPlaceholder("E-mail");
    if (await email.count()) {
      await email.fill(u.email);
      await page.getByRole("button", { name: "Continue" }).click().catch(() => undefined);
      continue;
    }
    const code = page.locator("input[inputmode='numeric'], input[autocomplete='one-time-code']");
    if ((await code.count()) >= 6 && !(await code.first().inputValue())) {
      await code.first().click();
      await page.keyboard.type(otp, { delay: 60 });
      continue;
    }
  }
  const modal = await page.locator("body").innerText().catch(() => "");
  throw new Error(`${u.label}: Dynamic login did not finish. Visible: ${modal.slice(-300).replace(/\s+/g, " ")}`);
}

export async function shot(page: Page, dir: string, name: string) {
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
}

export async function apiGet<T>(page: Page, path: string): Promise<T> {
  const r = await page.request.get(`${BASE}${path}`);
  return (await r.json()) as T;
}

export async function close(ctx: BrowserContext) {
  await ctx.close();
}
