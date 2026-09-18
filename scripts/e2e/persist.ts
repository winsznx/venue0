import { apiGet, BASE, openUser } from "./session.ts";

/** After a server restart: each user's session, target, circles, rounds and Activity are still there after a browser refresh. */
const dir = process.argv[2] as string;
let ok = true;
for (const label of ["A", "B", "C"] as const) {
  const u = await openUser(label, dir);
  await u.page.goto(`${BASE}/app`);
  await u.page.reload();
  const s = await apiGet<{ user: { address: string } | null }>(u.page, "/api/session");
  const t = await apiGet<{ target: { weights: unknown[] } | null }>(u.page, "/api/me/target");
  const c = await apiGet<{ mine: unknown[] }>(u.page, "/api/circles");
  await u.page.goto(`${BASE}/activity`);
  const settled = await u.page.getByText("Settled and verified onchain").count();
  const pass = s.user?.address.toLowerCase() === u.wallet.address.toLowerCase() && Boolean(t.target?.weights.length) && c.mine.length > 0 && settled > 0 && u.page.url().endsWith("/activity");
  ok &&= pass;
  console.log(`${pass ? "PASS" : "FAIL"} ${label}: session=${Boolean(s.user)} target=${Boolean(t.target)} circles=${c.mine.length} settledRows=${settled}`);
  await u.context.close();
}
console.log(`PERSIST ${ok ? "PASS" : "FAIL"}`);
