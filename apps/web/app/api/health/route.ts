import { db } from "@/lib/server/db/client";

/** Liveness plus database reachability, for the host's health check. Reports no configuration. */
export async function GET() {
  try {
    const d = await db();
    await d.query("select 1");
    return Response.json({ ok: true, database: d.kind }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, database: "unreachable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
