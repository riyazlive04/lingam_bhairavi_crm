"use server";
import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { customers, items, projects, salesOrders, stockAllocations, stockMovements } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { qty as fmtQty, round2, todayIST } from "@/lib/format";
import { getLatestCost } from "@/lib/items";
import { lastIssueRate, netIssuedToProject, stockPositions } from "@/lib/stock";

class StockError extends Error {}
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const optId = z.union([z.literal(""), z.coerce.number().int().positive()]).optional().transform((v) => (v === "" || v === undefined ? null : v));
const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const errMsg = (e: unknown, f: string) => publicError(e, f, [StockError]);
const get = (fd: FormData, k: string) => fd.get(k) ?? "";

async function finish(itemId: number, ok: string | null, err: string | null) {
  revalidatePath("/stock");
  revalidatePath(`/stock/${itemId}`);
  revalidatePath(`/items/${itemId}`);
  redirect(`/stock/${itemId}?` + (ok ? `ok=${encodeURIComponent(ok)}` : `err=${encodeURIComponent(err ?? "Failed")}`));
}

async function loadItem(itemId: number) {
  const db = await getDb();
  const [it] = await db.select({ id: items.id, code: items.code, uom: items.uom }).from(items).where(eq(items.id, itemId));
  if (!it) throw new StockError("Item not found");
  return { db, it };
}
async function assertProject(projectId: number) {
  const db = await getDb();
  const [p] = await db.select({ id: projects.id, code: projects.code, status: projects.status }).from(projects).where(eq(projects.id, projectId));
  if (!p) throw new StockError("Project not found");
  return p;
}
function checkDate(d: string) {
  if (d > todayIST(1)) throw new StockError("Date cannot be in the future");
}

const issueSchema = z.object({ projectId: z.coerce.number().int().positive("Choose a project"), qty: z.coerce.number().positive("Quantity must be greater than zero"), date: dateStr, notes: optText(500) });

/** Issue material from store to a project (stock_movements type issue_project, −qty, rate = latest cost). */
export async function issueToProject(itemId: number, fd: FormData) {
  const user = await requireWrite("stock");
  let ok: string | null = null, err: string | null = null;
  try {
    const p = issueSchema.parse({ projectId: get(fd, "projectId"), qty: get(fd, "qty"), date: get(fd, "date"), notes: get(fd, "notes") });
    checkDate(p.date);
    const { db, it } = await loadItem(itemId);
    const proj = await assertProject(p.projectId);
    if (proj.status === "closed") throw new StockError(`Project ${proj.code} is closed`);
    const cost = await getLatestCost(db, itemId);
    const rate = round2(cost?.rate ?? 0);
    const id = await db.transaction(async (tx) => {
      const onHand = (await stockPositions(tx, [itemId])).get(itemId)?.onHand ?? 0;
      if (p.qty > onHand + 1e-9) throw new StockError(`Only ${fmtQty(onHand)} ${it.uom} in stock`);
      const [m] = await tx.insert(stockMovements).values({ itemId, qty: -p.qty, type: "issue_project", rate, projectId: p.projectId, date: p.date, notes: p.notes, refType: "manual", createdBy: user.id }).returning({ id: stockMovements.id });
      return m.id;
    });
    await audit(db, user.id, "create", "stock_movement", id, { type: "issue_project", itemId, projectId: p.projectId, qty: -p.qty, rate });
    ok = `Issued ${fmtQty(p.qty)} ${it.uom} of ${it.code} to ${proj.code}`;
  } catch (e) {
    if (!(e instanceof StockError) && !(e instanceof z.ZodError)) console.error("issueToProject", e);
    err = errMsg(e, "Could not issue stock");
  }
  await finish(itemId, ok, err);
}

/** Return unused material from a project back to store (type 'return', +qty, valued at the last issue rate). */
export async function returnFromProject(itemId: number, fd: FormData) {
  const user = await requireWrite("stock");
  let ok: string | null = null, err: string | null = null;
  try {
    const p = issueSchema.parse({ projectId: get(fd, "projectId"), qty: get(fd, "qty"), date: get(fd, "date"), notes: get(fd, "notes") });
    checkDate(p.date);
    const { db, it } = await loadItem(itemId);
    const proj = await assertProject(p.projectId);
    const net = await netIssuedToProject(db, itemId, p.projectId);
    if (p.qty > net + 1e-9) throw new StockError(`Only ${fmtQty(net)} ${it.uom} of ${it.code} is net-issued to ${proj.code}`);
    const rate = round2((await lastIssueRate(db, itemId, p.projectId)) ?? (await getLatestCost(db, itemId))?.rate ?? 0);
    const [m] = await db.insert(stockMovements).values({ itemId, qty: p.qty, type: "return", rate, projectId: p.projectId, date: p.date, notes: p.notes, refType: "manual", createdBy: user.id }).returning({ id: stockMovements.id });
    await audit(db, user.id, "create", "stock_movement", m.id, { type: "return", itemId, projectId: p.projectId, qty: p.qty, rate });
    ok = `Returned ${fmtQty(p.qty)} ${it.uom} from ${proj.code}`;
  } catch (e) {
    if (!(e instanceof StockError) && !(e instanceof z.ZodError)) console.error("returnFromProject", e);
    err = errMsg(e, "Could not record return");
  }
  await finish(itemId, ok, err);
}

const adjustSchema = z.object({
  kind: z.enum(["adjust", "opening"]),
  qty: z.coerce.number().refine((n) => n !== 0, "Quantity cannot be zero"),
  date: dateStr,
  reason: z.string().trim().min(3, "Give a reason for the adjustment").max(500),
});

/** Stock adjustment (+/−) or opening stock, with mandatory reason. */
export async function adjustStock(itemId: number, fd: FormData) {
  const user = await requireWrite("stock");
  let ok: string | null = null, err: string | null = null;
  try {
    const p = adjustSchema.parse({ kind: get(fd, "kind") || "adjust", qty: get(fd, "qty"), date: get(fd, "date"), reason: get(fd, "reason") });
    checkDate(p.date);
    if (p.kind === "opening" && p.qty < 0) throw new StockError("Opening stock must be positive");
    const { db, it } = await loadItem(itemId);
    const rate = round2((await getLatestCost(db, itemId))?.rate ?? 0);
    const id = await db.transaction(async (tx) => {
      const onHand = (await stockPositions(tx, [itemId])).get(itemId)?.onHand ?? 0;
      if (onHand + p.qty < -1e-9) throw new StockError(`Adjustment would make stock negative (on hand ${fmtQty(onHand)} ${it.uom})`);
      const [m] = await tx.insert(stockMovements).values({ itemId, qty: p.qty, type: p.kind, rate, date: p.date, notes: p.reason, refType: "manual", createdBy: user.id }).returning({ id: stockMovements.id });
      return m.id;
    });
    await audit(db, user.id, "create", "stock_movement", id, { type: p.kind, itemId, qty: p.qty, reason: p.reason });
    ok = `${p.kind === "opening" ? "Opening stock" : "Adjustment"} of ${p.qty > 0 ? "+" : ""}${fmtQty(p.qty)} ${it.uom} recorded`;
  } catch (e) {
    if (!(e instanceof StockError) && !(e instanceof z.ZodError)) console.error("adjustStock", e);
    err = errMsg(e, "Could not record adjustment");
  }
  await finish(itemId, ok, err);
}

const allocSchema = z.object({
  qty: z.coerce.number().positive("Quantity must be greater than zero"),
  customerId: optId, orderId: optId, projectId: optId,
  notes: optText(500),
});

/** Reserve stock for a customer / sales order / project (stock_allocations status 'reserved'). */
export async function allocateStock(itemId: number, fd: FormData) {
  const user = await requireWrite("stock");
  let ok: string | null = null, err: string | null = null;
  try {
    const p = allocSchema.parse({ qty: get(fd, "qty"), customerId: get(fd, "customerId"), orderId: get(fd, "orderId"), projectId: get(fd, "projectId"), notes: get(fd, "notes") });
    if (!p.customerId && !p.orderId && !p.projectId) throw new StockError("Choose who the stock is reserved for (customer, order or project)");
    const { db, it } = await loadItem(itemId);
    let customerId = p.customerId;
    if (p.orderId) {
      const [o] = await db.select({ id: salesOrders.id, customerId: salesOrders.customerId }).from(salesOrders).where(eq(salesOrders.id, p.orderId));
      if (!o) throw new StockError("Order not found");
      customerId ??= o.customerId;
    }
    if (p.projectId) await assertProject(p.projectId);
    if (customerId) {
      const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
      if (!c) throw new StockError("Customer not found");
    }
    const id = await db.transaction(async (tx) => {
      const pos = (await stockPositions(tx, [itemId])).get(itemId) ?? { onHand: 0, reserved: 0, available: 0 };
      if (p.qty > pos.available + 1e-9) throw new StockError(`Only ${fmtQty(pos.available)} ${it.uom} available (on hand ${fmtQty(pos.onHand)}, reserved ${fmtQty(pos.reserved)})`);
      const [a] = await tx.insert(stockAllocations).values({ itemId, qty: p.qty, customerId, orderId: p.orderId, projectId: p.projectId, notes: p.notes, status: "reserved" }).returning({ id: stockAllocations.id });
      return a.id;
    });
    await audit(db, user.id, "create", "stock_allocation", id, { itemId, qty: p.qty, customerId, orderId: p.orderId, projectId: p.projectId });
    ok = `Reserved ${fmtQty(p.qty)} ${it.uom} of ${it.code}`;
  } catch (e) {
    if (!(e instanceof StockError) && !(e instanceof z.ZodError)) console.error("allocateStock", e);
    err = errMsg(e, "Could not allocate stock");
  }
  await finish(itemId, ok, err);
}

/** Release a reservation (reserved → released). `back` = 'list' returns to the allocations tab. */
export async function releaseAllocation(allocationId: number, back: "item" | "list") {
  const user = await requireWrite("stock");
  const db = await getDb();
  const r = await db.update(stockAllocations).set({ status: "released" })
    .where(and(eq(stockAllocations.id, allocationId), eq(stockAllocations.status, "reserved")))
    .returning({ id: stockAllocations.id, itemId: stockAllocations.itemId, qty: stockAllocations.qty });
  const a = r[0];
  if (a) await audit(db, user.id, "update", "stock_allocation", a.id, { status: "released", itemId: a.itemId, qty: a.qty });
  revalidatePath("/stock");
  const msg = a ? "ok=" + encodeURIComponent("Allocation released") : "err=" + encodeURIComponent("Allocation is not reserved any more");
  if (back === "list" || !a) redirect(`/stock?view=allocations&${msg}`);
  revalidatePath(`/stock/${a.itemId}`);
  redirect(`/stock/${a.itemId}?${msg}`);
}
