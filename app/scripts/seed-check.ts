/**
 * Seed smoke test: fresh PGlite in a temp dir → run embedded migrations → seed() → print row counts.
 * Usage:  npx tsx scripts/seed-check.ts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import { MIGRATIONS } from "../src/db/migrations.generated";
import { seed } from "../src/db/seed";
import type { DB } from "../src/db/index";

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "lbe-seed-check-"));
  const client = new PGlite(dir);
  await client.waitReady;
  try {
    for (const m of MIGRATIONS) {
      for (const stmt of m.sql.split("--> statement-breakpoint")) if (stmt.trim()) await client.exec(stmt);
    }
    const db = drizzle(client, { schema }) as unknown as DB;
    const t0 = Date.now();
    await seed(db);
    console.log(`seed() finished in ${Date.now() - t0} ms\n`);

    const tables = (await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).rows.map((r) => r.tablename);
    for (const t of tables) {
      const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}"`);
      console.log(`${t.padEnd(26)} ${String(rows[0].n).padStart(6)}`);
    }

    const q = async (label: string, sql: string) => {
      const { rows } = await client.query(sql);
      console.log(`\n-- ${label}`);
      console.table(rows);
    };
    await q("quotations by status", `SELECT status, count(*)::int n, round(sum(grand_total)::numeric,0) total FROM quotations GROUP BY status ORDER BY status`);
    await q("projects: budget vs cost", `
      SELECT p.code, p.status, round(p.contract_value::numeric,0) contract, round(p.budget::numeric,0) budget,
        round(coalesce((SELECT sum(-qty*rate) FROM stock_movements m WHERE m.project_id=p.id AND m.type='issue_project'),0)::numeric,0) material,
        round(coalesce((SELECT sum(amount) FROM expense_allocations a WHERE a.project_id=p.id),0)::numeric,0) expenses
      FROM projects p ORDER BY p.code`);
    await q("sales invoices", `SELECT number, status, invoice_date, due_date, round(total::numeric,0) total, round(paid_amount::numeric,0) paid FROM sales_invoices ORDER BY invoice_date`);
    await q("pending SO lines (expected in past)", `SELECT o.number, l.delivery_status, l.expected_date, l.qty, l.delivered_qty FROM sales_order_lines l JOIN sales_orders o ON o.id=l.order_id WHERE l.delivered_qty < l.qty ORDER BY l.expected_date`);
    await q("low stock", `SELECT i.code, i.reorder_level, sum(m.qty) on_hand FROM items i JOIN stock_movements m ON m.item_id=i.id GROUP BY i.id HAVING sum(m.qty) < i.reorder_level OR sum(m.qty) < 0`);
    await q("extinguisher due buckets", `SELECT CASE WHEN next_due_date < current_date THEN 'overdue' WHEN next_due_date <= current_date + 10 THEN 'due<=10d' ELSE 'later' END b, count(*)::int FROM extinguisher_assets GROUP BY 1`);
    await q("vendor outstanding", `SELECT count(*)::int n, round(sum(total-paid_amount)::numeric,0) outstanding, count(*) FILTER (WHERE due_date < current_date AND paid_amount < total)::int overdue FROM purchase_invoices`);
    await q("sequences", `SELECT * FROM sequences ORDER BY key`);
    await q("price history sample (Pipe GI 100NB)", `SELECT ph.kind, ph.date, ph.rate, v.name vendor FROM price_history ph JOIN items i ON i.id=ph.item_id LEFT JOIN vendors v ON v.id=ph.vendor_id WHERE i.code='HS-PGI-100' ORDER BY ph.date`);
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
