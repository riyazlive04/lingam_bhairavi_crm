/** Atomic document numbering, e.g. nextNumber(db, "quotation") -> "LBE/Q/2026-27/0019" */
import "server-only";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { financialYear, todayIST } from "./format";

const PREFIX: Record<string, string> = {
  quotation: "LBE/Q", sales_order: "LBE/SO", sales_invoice: "LBE/INV", delivery: "LBE/DC",
};

export async function nextSeq(db: DB, key: string): Promise<number> {
  const r = await db.execute(sql`INSERT INTO sequences(key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1 RETURNING value`);
  const rows = (r as unknown as { rows: { value: number }[] }).rows;
  return Number(rows[0].value);
}

/** kinds: quotation | sales_order | sales_invoice | delivery | expense | project */
export async function nextNumber(db: DB, kind: string, date = todayIST()): Promise<string> {
  if (kind === "expense") return `EXP-${String(await nextSeq(db, "expense")).padStart(4, "0")}`;
  if (kind === "project") {
    const y = date.slice(0, 4);
    return `PRJ-${y}-${String(await nextSeq(db, `project:${y}`)).padStart(3, "0")}`;
  }
  const fy = financialYear(date);
  const n = await nextSeq(db, `${kind}:${fy}`);
  return `${PREFIX[kind] ?? kind.toUpperCase()}/${fy}/${String(n).padStart(4, "0")}`;
}
