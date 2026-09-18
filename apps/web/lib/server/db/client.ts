import "server-only";
import { resolve } from "node:path";
import { encodeBigints, reviveBigints } from "../../json";
import { env } from "../env";
import { MIGRATIONS } from "./schema";

export type Row = Record<string, unknown>;

export type Db = {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  tx<R>(fn: (db: Pick<Db, "query">) => Promise<R>): Promise<R>;
  kind: "postgres" | "pglite";
};

/**
 * D-019: one SQL dialect, two drivers. DATABASE_URL selects a real Postgres server (Supabase, Neon, RDS). Without it the
 * server runs embedded Postgres (PGlite) persisted to apps/web/.venue0-db, which survives restarts on a single host.
 */
async function connect(): Promise<Db> {
  if (env.databaseUrl) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(env.databaseUrl, { max: 5, onnotice: () => undefined });
    const run = (s: typeof sql) => async <T extends Row>(text: string, params: unknown[] = []) => (await s.unsafe(text, params as never[])) as unknown as T[];
    return { kind: "postgres", query: run(sql), tx: (fn) => sql.begin((t) => fn({ query: run(t as unknown as typeof sql) })) as Promise<never> };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const lite = await PGlite.create(resolve(process.cwd(), ".venue0-db"));
  const run = (s: Pick<typeof lite, "query">) => async <T extends Row>(text: string, params: unknown[] = []) => (await s.query<T>(text, params)).rows;
  return { kind: "pglite", query: run(lite), tx: (fn) => lite.transaction((t) => fn({ query: run(t) })) };
}

async function migrate(db: Db) {
  await db.query("create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())");
  const applied = new Set((await db.query<{ id: string }>("select id from schema_migrations")).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await db.tx(async (t) => {
      for (const statement of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await t.query(statement);
      await t.query("insert into schema_migrations (id) values ($1)", [m.id]);
    });
  }
}

const globalForDb = globalThis as unknown as { venue0Db?: Promise<Db> };

export function db(): Promise<Db> {
  globalForDb.venue0Db ??= connect().then(async (d) => {
    await migrate(d);
    return d;
  });
  return globalForDb.venue0Db;
}

/** JSON columns hold matcher and plan objects that carry bigints; they round-trip as {"$bigint": "<decimal>"}. */
export const toJson = encodeBigints;

export function fromJson<T>(value: unknown): T {
  return reviveBigints<T>(typeof value === "string" ? JSON.parse(value) : value);
}
