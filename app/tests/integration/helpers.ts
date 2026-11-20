/**
 * Integration-test helper: a fresh in-memory PGlite with the app's embedded migrations + demo seed.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { MIGRATIONS } from "@/db/migrations.generated";
import { seed } from "@/db/seed";
import type { DB } from "@/db";

export type TestDb = { db: DB; client: PGlite; close: () => Promise<void> };

export async function freshSeededDb(): Promise<TestDb> {
  const client = new PGlite("memory://");
  await client.waitReady;
  for (const m of MIGRATIONS) {
    for (const stmt of m.sql.split("--> statement-breakpoint")) if (stmt.trim()) await client.exec(stmt);
  }
  const db = drizzle(client, { schema }) as unknown as DB;
  await seed(db);
  return { db, client, close: () => client.close() };
}

/** Run a scalar SQL query (first column of first row) as a number. */
export async function scalar(client: PGlite, sql: string, params: unknown[] = []): Promise<number> {
  const r = await client.query<Record<string, unknown>>(sql, params);
  const row = r.rows[0];
  return row ? Number(Object.values(row)[0] ?? 0) : 0;
}
