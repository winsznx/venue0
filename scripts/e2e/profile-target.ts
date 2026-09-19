import { BASE, openUser } from "./session.ts";

/** Times the target check and the portfolio read through the API with an existing session (no page, no Dynamic calls). */
const dir = process.argv[2] as string;
const u = await openUser("A", dir, { profile: "prod-A" });
const target = (await (await u.page.request.get(`${BASE}/api/me/target`)).json()).target;
for (let i = 0; i < 3; i++) {
  let t = performance.now();
  const p = await u.page.request.get(`${BASE}/api/me/portfolio`);
  const portfolioMs = Math.round(performance.now() - t);
  t = performance.now();
  const r = await u.page.request.post(`${BASE}/api/me/target/preview`, { data: { mode: "STRUCTURED", target: { ...target, source: "STRUCTURED", instruction: null } } });
  console.log(JSON.stringify({ run: i + 1, portfolio: { status: p.status(), ms: portfolioMs }, check: { status: r.status(), ms: Math.round(performance.now() - t), ok: (await r.json()).ok, requestId: r.headers()["x-request-id"] } }));
}
await u.context.close();
