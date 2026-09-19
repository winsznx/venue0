import { BASE, openUser } from "./session.ts";
/** One authenticated API POST with an existing profile's session. Args: <dir> <label> <profile> <path> <json> */
const [dir, label, profile, path, body] = process.argv.slice(2) as [string, "A", string, string, string];
const u = await openUser(label, dir, { profile });
const t = performance.now();
const r = await u.page.request.post(`${BASE}${path}`, { data: JSON.parse(body), timeout: 300_000 });
console.log(JSON.stringify({ status: r.status(), ms: Math.round(performance.now() - t), requestId: r.headers()["x-request-id"] }), (await r.text()).slice(0, 600));
await u.context.close();
