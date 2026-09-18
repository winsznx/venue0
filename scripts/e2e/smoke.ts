import { chromium } from "playwright-core";

/** Clean-browser smoke: public pages render without console errors or horizontal overflow; product routes gate to onboarding. */
const base = "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
let failed = 0;
for (const width of [1360, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
  for (const path of ["/", "/proof", "/demo", "/onboarding", "/app", "/circles", "/round/0xdead/lobby", "/nope"]) {
    errors.length = 0;
    const res = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const gated = ["/app", "/circles", "/round/0xdead/lobby"].includes(path);
    const ok = (gated ? page.url().includes("/onboarding") : true) && overflow <= 1 && errors.filter((e) => !/404|Not Found/.test(e)).length === 0;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${width}px ${path} → ${new URL(page.url()).pathname} status=${res?.status()} overflow=${overflow} errors=${errors.join(" | ") || "none"}`);
  }
  await ctx.close();
}
await browser.close();
console.log(`SMOKE ${failed === 0 ? "PASS" : `FAIL (${failed})`}`);
