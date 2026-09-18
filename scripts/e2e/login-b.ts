import { apiGet, BASE, dynamicLogin, openUser } from "./session.ts";
const dir = process.argv[2] as string;
const u = await openUser((process.argv[3] ?? "B") as "B", dir);
await u.page.goto(`${BASE}/onboarding`);
await u.page.getByRole("button", { name: "Get started" }).click();
try { await dynamicLogin(u); console.log(JSON.stringify(await apiGet(u.page, "/api/session"))); } finally { await u.page.screenshot({ path: `${dir}/login-${u.label}.png` }); await u.context.close(); }
