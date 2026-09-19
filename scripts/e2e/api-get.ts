import { BASE, openUser } from "./session.ts";
/** One authenticated API GET with an existing profile's session (no page load). Args: <dir> <label> <profile> <path> */
const [dir, label, profile, path] = process.argv.slice(2) as [string, "A", string, string];
const u = await openUser(label, dir, { profile });
const t = performance.now();
const r = await u.page.request.get(`${BASE}${path}`, { timeout: 300_000 });
const body = await r.text();
console.log(JSON.stringify({ status: r.status(), ms: Math.round(performance.now() - t), requestId: r.headers()["x-request-id"] }), body.slice(0, 300));
await u.context.close();
