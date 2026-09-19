import { BASE, openUser } from "./session.ts";
const [dir, label] = process.argv.slice(2) as [string, "B"];
const u = await openUser(label, dir);
await u.page.goto(`${BASE}/onboarding`);
await u.page.getByRole("button", { name: "Get started" }).click();
await u.page.waitForTimeout(20_000);
await u.page.screenshot({ path: `${dir}/look-onboard-${label}.png` });
console.log((await u.page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 600));
await u.context.close();
