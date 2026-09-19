import "server-only";
import { resolve } from "node:path";
import { encodeBigints, reviveBigints } from "../../json";
import { env } from "../env";
import { log } from "../log";
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
async function connect(url = env.databaseUrl, options: { max: number; fetchTypes: boolean } = { max: 5, fetchTypes: true }): Promise<Db> {
  if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, { max: options.max, fetch_types: options.fetchTypes, onnotice: () => undefined });
    const run = (s: typeof sql) => async <T extends Row>(text: string, params: unknown[] = []) => (await s.unsafe(text, params as never[])) as unknown as T[];
    return {
      kind: "postgres",
      query: (text, params) => retryUnsent(() => run(sql)(text, params)),
      tx: (fn) => retryUnsent(() => sql.begin((t) => fn({ query: run(t as unknown as typeof sql) })) as Promise<never>),
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const lite = await PGlite.create(resolve(process.cwd(), ".venue0-db"));
  const run = (s: Pick<typeof lite, "query">) => async <T extends Row>(text: string, params: unknown[] = []) => (await s.query<T>(text, params)).rows;
  return { kind: "pglite", query: run(lite), tx: (fn) => lite.transaction((t) => fn({ query: run(t) })) };
}

/**
 * A pooled socket can be closed by the pooler between requests. postgres.js reports that as "write CONNECTION_CLOSED"
 * when the statement could not be written, so nothing reached the database and one retry on a fresh connection is safe.
 * Any other failure, including a drop after the statement was sent, is not retried.
 */
async function retryUnsent<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code !== "CONNECTION_CLOSED" || !/^write /.test(e.message ?? "")) throw error;
    log("db.retry_unsent", { error: e.message?.split(" ").slice(0, 2).join(" ") }, "warn");
    return fn();
  }
}

/** Arbitrary constant key for the Postgres advisory lock that serializes migrations across app instances. */
const MIGRATION_LOCK = 4_663_000_001;

/** All pending migrations apply in one transaction; on Postgres an advisory lock makes concurrent boots wait their turn. */
async function migrate(db: Db) {
  await db.tx(async (t) => {
    if (db.kind === "postgres") await t.query("select pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
    await applyMigrations(t);
  });
}

async function applyMigrations(db: Pick<Db, "query">) {
  await db.query("create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())");
  const applied = new Set((await db.query<{ id: string }>("select id from schema_migrations")).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    for (const statement of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await db.query(statement);
    await db.query("insert into schema_migrations (id) values ($1)", [m.id]);
    log("db.migrated", { id: m.id });
  }
}

const globalForDb = globalThis as unknown as { venue0Db?: Promise<Db> };

/** True inside a Cloudflare Worker (OpenNext deployment). */
const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

/**
 * Workers may not reuse a database socket across requests, so each request gets its own client through Hyperdrive,
 * keyed by the request's ExecutionContext. Migrations are not run here; `pnpm db:migrate` applies them at deploy time.
 */
const perRequest = new WeakMap<object, Promise<Db>>();

async function workerDb(): Promise<Db> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env: bindings, ctx } = getCloudflareContext();
  const hyperdrive = (bindings as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
  const url = hyperdrive?.connectionString ?? env.databaseUrl;
  if (!url) throw new Error("database not configured: no HYPERDRIVE binding or DATABASE_URL");
  let client = perRequest.get(ctx);
  if (!client) {
    // One connection per request: its queries run one after another, and Workers cap simultaneous outbound
    // connections per request, which several pooled sockets plus registry fetches can exceed.
    client = connect(url, { max: 1, fetchTypes: false });
    perRequest.set(ctx, client);
  }
  return client;
}

export function db(): Promise<Db> {
  if (onWorkers) return workerDb();
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
