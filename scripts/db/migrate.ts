import postgres from "postgres";
import { MIGRATIONS } from "../../apps/web/lib/server/db/schema.ts";

/**
 * Applies pending schema migrations to DATABASE_URL, all in one transaction under the same advisory lock the app
 * uses, and prints only migration ids and table names (never the connection string).
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1, onnotice: () => undefined });
try {
  const applied = await sql.begin(async (t) => {
    await t`select pg_advisory_xact_lock(${4_663_000_001})`;
    await t`create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await t<{ id: string }[]>`select id from schema_migrations`).map((r) => r.id));
    const ran: string[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      for (const statement of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await t.unsafe(statement);
      await t`insert into schema_migrations (id) values (${m.id})`;
      ran.push(m.id);
    }
    return ran;
  });
  const tables = await sql<{ table_name: string }[]>`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
  console.log(JSON.stringify({ event: "db.migrate", applied, tables: tables.map((t) => t.table_name) }));
} finally {
  await sql.end();
}
