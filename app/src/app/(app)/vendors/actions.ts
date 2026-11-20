"use server";
import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { items, vendorItems, vendors } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { SYSTEMS } from "@/lib/constants";
import { round2, todayIST } from "@/lib/format";
import { firstErr, formObj, partyBase } from "./_components/party-schema";

const vendorSchema = z.object({ ...partyBase });
const systemKeys = Object.keys(SYSTEMS);

function parse(fd: FormData) {
  const p = vendorSchema.safeParse(formObj(fd));
  const systems = fd.getAll("systems").map(String).filter((s) => systemKeys.includes(s));
  return { p, systems };
}

export async function createVendor(fd: FormData) {
  const user = await requireWrite("vendors");
  const { p, systems } = parse(fd);
  if (!p.success) redirect("/vendors/new?err=" + encodeURIComponent(firstErr(p.error)));
  const db = await getDb();
  let target: string;
  try {
    const dup = await db.select({ id: vendors.id }).from(vendors).where(sql`lower(${vendors.name}) = lower(${p.data.name})`);
    if (dup.length) throw new Error(`A vendor named “${p.data.name}” already exists`);
    const [v] = await db.insert(vendors).values({ ...p.data, systems }).returning({ id: vendors.id });
    await audit(db, user.id, "create", "vendor", v.id, { name: p.data.name });
    target = `/vendors/${v.id}?ok=` + encodeURIComponent("Vendor created");
  } catch (e) {
    target = "/vendors/new?err=" + encodeURIComponent(publicError(e, "Could not create vendor"));
  }
  revalidatePath("/vendors");
  redirect(target);
}

export async function updateVendor(id: number, fd: FormData) {
  const user = await requireWrite("vendors");
  const { p, systems } = parse(fd);
  if (!p.success) redirect(`/vendors/${id}/edit?err=` + encodeURIComponent(firstErr(p.error)));
  const db = await getDb();
  let target: string;
  try {
    const r = await db.update(vendors).set({ ...p.data, systems, active: fd.get("active") === "on" }).where(eq(vendors.id, id)).returning({ id: vendors.id });
    if (!r.length) throw new Error("Vendor not found");
    await audit(db, user.id, "update", "vendor", id, { ...p.data, systems });
    target = `/vendors/${id}?ok=` + encodeURIComponent("Vendor updated");
  } catch (e) {
    target = `/vendors/${id}/edit?err=` + encodeURIComponent(publicError(e, "Could not update vendor"));
  }
  revalidatePath("/vendors");
  redirect(target);
}

const linkSchema = z.object({
  itemId: z.coerce.number().int().positive("Choose an item"),
  lastRate: z.union([z.literal(""), z.coerce.number().positive()]).optional().transform((v) => (v === "" || v === undefined ? null : round2(v))),
  leadTimeDays: z.union([z.literal(""), z.coerce.number().int().min(0).max(365)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
});

/** Manually link an item to a vendor (vendor master) or update its quoted rate / lead time. */
export async function linkVendorItem(vendorId: number, fd: FormData) {
  const user = await requireWrite("vendors");
  const p = linkSchema.safeParse(formObj(fd));
  if (!p.success) redirect(`/vendors/${vendorId}?err=` + encodeURIComponent(firstErr(p.error)));
  const db = await getDb();
  let target: string;
  try {
    const [it] = await db.select({ id: items.id, code: items.code }).from(items).where(eq(items.id, p.data.itemId));
    if (!it) throw new Error("Item not found");
    const [v] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, vendorId));
    if (!v) throw new Error("Vendor not found");
    const set: { leadTimeDays: number | null; lastRate?: number; lastDate?: string } = { leadTimeDays: p.data.leadTimeDays };
    if (p.data.lastRate != null) { set.lastRate = p.data.lastRate; set.lastDate = todayIST(); }
    await db.insert(vendorItems).values({ vendorId, itemId: it.id, ...set })
      .onConflictDoUpdate({ target: [vendorItems.vendorId, vendorItems.itemId], set });
    await audit(db, user.id, "update", "vendor_item", vendorId, { itemId: it.id, ...set });
    target = `/vendors/${vendorId}?ok=` + encodeURIComponent(`${it.code} linked to vendor`);
  } catch (e) {
    target = `/vendors/${vendorId}?err=` + encodeURIComponent(publicError(e, "Could not link item"));
  }
  revalidatePath(`/vendors/${vendorId}`);
  redirect(target);
}

export async function unlinkVendorItem(vendorId: number, itemId: number) {
  const user = await requireWrite("vendors");
  const db = await getDb();
  await db.delete(vendorItems).where(and(eq(vendorItems.vendorId, vendorId), eq(vendorItems.itemId, itemId)));
  await audit(db, user.id, "delete", "vendor_item", vendorId, { itemId });
  revalidatePath(`/vendors/${vendorId}`);
  redirect(`/vendors/${vendorId}?ok=` + encodeURIComponent("Item removed from vendor list (purchase history is kept)"));
}
