import { BASE, openUser } from "./session.ts";
const [dir, label, path] = process.argv.slice(2) as [string, "A", string];
const u = await openUser(label, dir);
await u.page.goto(`${BASE}${path}`);
await u.page.waitForTimeout(12_000);
await u.page.screenshot({ path: `${dir}/look-${label}.png`, fullPage: true });
console.log((await u.page.locator("main").innerText()).slice(0, 1500));
await u.context.close();
