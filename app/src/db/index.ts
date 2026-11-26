/**
 * Database access. Maintainer: Sirah Digital.
 *
 * - Production: Neon serverless Postgres when DATABASE_URL is set.
 * - Local / demo: embedded PGlite (Postgres compiled to WASM). Data dir: PGLITE_DIR or ./.data/pglite
 *   (on Vercel without DATABASE_URL it uses /tmp, i.e. an ephemeral demo database that re-seeds on cold start).
 *
 * Usage (server only):  const db = await getDb();  await db.select().from(items)
 */
import "server-only";
import * as schema from "./schema";
import { MIGRATIONS } from "./migrations.generated";
import type { PgliteDatabase } from "drizzle-orm/pglite";

export type DB = PgliteDatabase<typeof schema>;
export { schema };

type RawExec = (sql: string) => Promise<void>;
type RawQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

const g = globalThis as unknown as { __lbeDb?: Promise<DB> };

export function isDemoDatabase() {
  return !process.env.DATABASE_URL;
}

async function connect(): Promise<{ db: DB; exec: RawExec; query: RawQuery }> {
  if (process.env.DATABASE_URL) {
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool, { schema }) as unknown as DB;
    return {
      db,
      exec: async (sql) => { await pool.query(sql); },
      query: async (sql, params) => { const r = await pool.query(sql, params as unknown[]); return { rows: r.rows }; },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = process.env.PGLITE_DIR || (process.env.VERCEL ? "/tmp/lbe-pglite" : "./.data/pglite");
  if (dir !== "memory://") {
    const fs = await import("node:fs");
    fs.mkdirSync(dir, { recursive: true });
  }
  const client = new PGlite(dir);
  await client.waitReady;
  const db = drizzle(client, { schema }) as DB;
  return {
    db,
    exec: async (sql) => { await client.exec(sql); },
    query: async (sql, params) => { const r = await client.query(sql, params as unknown[]); return { rows: r.rows as Record<string, unknown>[] }; },
  };
}

async function migrate(exec: RawExec, query: RawQuery) {
  await exec(`CREATE TABLE IF NOT EXISTS __migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`);
  // advisory lock so concurrent cold starts don't race (no-op cost on PGlite)
  await exec(`SELECT pg_advisory_lock(424242)`);
  try {
    const done = new Set((await query(`SELECT name FROM __migrations`)).rows.map((r) => String(r.name)));
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      for (const stmt of m.sql.split("--> statement-breakpoint")) {
        if (stmt.trim()) await exec(stmt);
      }
      await query(`INSERT INTO __migrations(name) VALUES ($1)`, [m.name]);
    }
  } finally {
    await exec(`SELECT pg_advisory_unlock(424242)`);
  }
}

/** One-off version 2 steps for databases created before v2. Guarded by settings keys; never blocks boot. */
async function upgradeExisting(db: DB) {
  try {
    const { eq } = await import("drizzle-orm");
    const flag = async (key: string) => (await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1))[0]?.value === true;
    const mark = (key: string) => db.insert(schema.settings).values({ key, value: true })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: true } });
    const { backfillV2, seedV2Demo } = await import("./seed-v2");
    if (!(await flag("migrations.v2_backfill_done"))) {
      await backfillV2(db);
      await mark("migrations.v2_backfill_done");
    }
    if (process.env.SEED_V2_DEMO === "1" && !(await flag("migrations.v2_demo_seeded"))) {
      await seedV2Demo(db);
      await mark("migrations.v2_demo_seeded");
    }
  } catch (e) {
    console.error("[db] version 2 upgrade step failed (boot continues):", e);
  }
}

async function init(): Promise<DB> {
  const { db, exec, query } = await connect();
  await migrate(exec, query);
  const { rows } = await query(`SELECT count(*)::int AS n FROM users`);
  if (Number(rows[0]?.n ?? 0) === 0) {
    const { seed } = await import("./seed");
    await seed(db);
  } else {
    await upgradeExisting(db);
  }
  return db;
}

export function getDb(): Promise<DB> {
  if (!g.__lbeDb) {
    g.__lbeDb = init().catch((e) => {
      g.__lbeDb = undefined;
      throw e;
    });
  }
  return g.__lbeDb;
}
