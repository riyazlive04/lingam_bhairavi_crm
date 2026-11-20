/**
 * Stock helpers. OWNED BY: Team A (Masters & Purchasing).
 * On hand = Σ stock_movements.qty; reserved = Σ stock_allocations.qty where status = 'reserved'.
 */
import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { stockAllocations, stockMovements } from "@/db/schema";
import type { Executor } from "./items";

export const MOVEMENT_TYPES = {
  opening: "Opening stock",
  purchase_in: "Purchase in",
  issue_project: "Issued to project",
  return: "Returned from project",
  sale_out: "Sale / dispatch",
  adjust: "Adjustment",
} as const;
export type MovementType = keyof typeof MOVEMENT_TYPES;

/** Stock on hand per item → Map(itemId → qty). Items without movements are absent (treat as 0). */
export async function stockOnHand(db: Executor, itemIds?: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (itemIds && !itemIds.length) return out;
  const rows = await db
    .select({ itemId: stockMovements.itemId, qty: sql<number>`coalesce(sum(${stockMovements.qty}),0)`.mapWith(Number) })
    .from(stockMovements)
    .where(itemIds ? inArray(stockMovements.itemId, itemIds) : undefined)
    .groupBy(stockMovements.itemId);
  for (const r of rows) out.set(r.itemId, Number(r.qty));
  return out;
}

/** Stock on hand of a single item. */
export async function stockOnHandOf(db: Executor, itemId: number): Promise<number> {
  return (await stockOnHand(db, [itemId])).get(itemId) ?? 0;
}

/** Reserved (allocated, not yet released/consumed) qty per item → Map(itemId → qty). */
export async function reservedQty(db: Executor, itemIds?: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (itemIds && !itemIds.length) return out;
  const rows = await db
    .select({ itemId: stockAllocations.itemId, qty: sql<number>`coalesce(sum(${stockAllocations.qty}),0)`.mapWith(Number) })
    .from(stockAllocations)
    .where(and(eq(stockAllocations.status, "reserved"), itemIds ? inArray(stockAllocations.itemId, itemIds) : undefined))
    .groupBy(stockAllocations.itemId);
  for (const r of rows) out.set(r.itemId, Number(r.qty));
  return out;
}

export type StockPosition = { onHand: number; reserved: number; available: number };
/** On hand, reserved and available (= on hand − reserved) for the given items (all items with activity when omitted). */
export async function stockPositions(db: Executor, itemIds?: number[]): Promise<Map<number, StockPosition>> {
  const [oh, rs] = await Promise.all([stockOnHand(db, itemIds), reservedQty(db, itemIds)]);
  const ids = new Set<number>([...oh.keys(), ...rs.keys(), ...(itemIds ?? [])]);
  const out = new Map<number, StockPosition>();
  for (const id of ids) {
    const onHand = oh.get(id) ?? 0, reserved = rs.get(id) ?? 0;
    out.set(id, { onHand, reserved, available: onHand - reserved });
  }
  return out;
}

/** Rate of the most recent issue of an item to a project (used to value returns), or null. */
export async function lastIssueRate(db: Executor, itemId: number, projectId: number): Promise<number | null> {
  const [r] = await db
    .select({ rate: stockMovements.rate })
    .from(stockMovements)
    .where(and(eq(stockMovements.itemId, itemId), eq(stockMovements.projectId, projectId), eq(stockMovements.type, "issue_project")))
    .orderBy(desc(stockMovements.date), desc(stockMovements.id))
    .limit(1);
  return r ? Number(r.rate) : null;
}

/** Net qty of an item currently issued to a project (issues − returns), ≥ 0. */
export async function netIssuedToProject(db: Executor, itemId: number, projectId: number): Promise<number> {
  const [r] = await db
    .select({ q: sql<number>`coalesce(sum(case when ${stockMovements.type} = 'issue_project' then -${stockMovements.qty} when ${stockMovements.type} = 'return' then -${stockMovements.qty} else 0 end),0)`.mapWith(Number) })
    .from(stockMovements)
    .where(and(eq(stockMovements.itemId, itemId), eq(stockMovements.projectId, projectId)));
  return Math.max(0, Number(r?.q ?? 0));
}
