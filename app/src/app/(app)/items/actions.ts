"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { items, priceHistory } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SYSTEMS } from "@/lib/constants";
import { round2, todayIST } from "@/lib/format";

const optStr = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const optNum = z.union([z.literal(""), z.coerce.number().min(0)]).optional().transform((v) => (v === "" || v === undefined ? null : v));

const itemSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(40).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Name is required").max(200),
  system: z.enum(Object.keys(SYSTEMS) as [keyof typeof SYSTEMS, ...(keyof typeof SYSTEMS)[]]),
  groupName: z.string().trim().min(1, "Group is required").max(120),
  size: optStr(40),
  make: optStr(80),
  uom: z.string().trim().min(1).max(20),
  hsn: optStr(20),
  gstRate: z.coerce.number().min(0).max(28),
  markupPct: z.coerce.number().min(0).max(500),
  erectionRate: z.coerce.number().min(0).default(0),
  reorderLevel: z.coerce.number().min(0).default(0),
  description: optStr(4000),
});

function parse(fd: FormData) {
  const raw = Object.fromEntries(fd.entries());
  return itemSchema.safeParse(raw);
}
const firstErr = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input";

export async function createItem(fd: FormData) {
  const user = await requireWrite("items");
  const p = parse(fd);
  if (!p.success) redirect("/items/new?err=" + encodeURIComponent(firstErr(p.error)));
  const listPrice = optNum.safeParse(fd.get("listPrice") ?? "");
  const db = await getDb();
  let target: string;
  try {
    const dup = await db.select({ id: items.id }).from(items).where(sql`upper(${items.code}) = ${p.data.code}`);
    if (dup.length) throw new Error(`Item code ${p.data.code} already exists`);
    const lp = listPrice.success && listPrice.data != null ? round2(listPrice.data) : null;
    const [row] = await db.insert(items).values({ ...p.data, listPrice: lp, volatilePrice: fd.get("volatilePrice") === "on" }).returning({ id: items.id });
    if (lp != null) {
      await db.insert(priceHistory).values({ itemId: row.id, kind: "list", rate: lp, date: todayIST(), refType: "manual" });
    }
    await audit(db, user.id, "create", "item", row.id, { code: p.data.code, name: p.data.name });
    target = `/items/${row.id}?ok=` + encodeURIComponent("Item created");
  } catch (e) {
    target = "/items/new?err=" + encodeURIComponent(e instanceof Error ? e.message : "Could not create item");
  }
  revalidatePath("/items");
  redirect(target);
}

export async function updateItem(id: number, fd: FormData) {
  const user = await requireWrite("items");
  const p = parse(fd);
  if (!p.success) redirect(`/items/${id}/edit?err=` + encodeURIComponent(firstErr(p.error)));
  const db = await getDb();
  let target: string;
  try {
    const dup = await db.select({ id: items.id }).from(items).where(and(sql`upper(${items.code}) = ${p.data.code}`, ne(items.id, id)));
    if (dup.length) throw new Error(`Item code ${p.data.code} is used by another item`);
    const res = await db.update(items).set({ ...p.data, volatilePrice: fd.get("volatilePrice") === "on", active: fd.get("active") === "on" })
      .where(eq(items.id, id)).returning({ id: items.id });
    if (!res.length) throw new Error("Item not found");
    await audit(db, user.id, "update", "item", id, p.data);
    target = `/items/${id}?ok=` + encodeURIComponent("Item updated");
  } catch (e) {
    target = `/items/${id}/edit?err=` + encodeURIComponent(e instanceof Error ? e.message : "Could not update item");
  }
  revalidatePath("/items");
  redirect(target);
}

const listPriceSchema = z.object({
  listPrice: z.coerce.number().positive("List price must be greater than zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Manual "Update list price": sets items.listPrice and records price_history kind 'list'. */
export async function updateListPrice(id: number, fd: FormData) {
  const user = await requireWrite("items");
  const p = listPriceSchema.safeParse({ listPrice: fd.get("listPrice"), date: fd.get("date") || undefined });
  if (!p.success) redirect(`/items/${id}?err=` + encodeURIComponent(firstErr(p.error)));
  const db = await getDb();
  let target: string;
  try {
    const [it] = await db.select({ listPrice: items.listPrice }).from(items).where(eq(items.id, id));
    if (!it) throw new Error("Item not found");
    const rate = round2(p.data.listPrice);
    const date = p.data.date ?? todayIST();
    await db.transaction(async (tx) => {
      await tx.update(items).set({ listPrice: rate }).where(eq(items.id, id));
      await tx.insert(priceHistory).values({ itemId: id, kind: "list", rate, date, refType: "manual" });
    });
    await audit(db, user.id, "update", "item", id, { listPrice: { from: it.listPrice, to: rate } });
    target = `/items/${id}?ok=` + encodeURIComponent("List price updated");
  } catch (e) {
    target = `/items/${id}?err=` + encodeURIComponent(e instanceof Error ? e.message : "Could not update list price");
  }
  revalidatePath(`/items/${id}`);
  revalidatePath("/items");
  redirect(target);
}
