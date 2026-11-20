"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { customers, extinguisherAssets, refillServices } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { addDays, addMonths, round2, todayIST } from "@/lib/format";
import { HPT_INTERVAL_MONTHS, REFILL_KINDS, computeNextDue, type RefillKind } from "@/lib/refills";
import { UserError, errMsg, flashUrl, zDate, zId, zOptDate, zOptId, zOptText, zText } from "../projects/_lib/forms";

const zInterval = z.coerce.number().int().min(1, "Interval must be at least 1 month").max(120, "Interval cannot exceed 120 months");

const AssetInput = z.object({
  id: zOptId,
  customerId: zId,
  location: zOptText(200),
  extType: zText(60, "Extinguisher type"),
  make: zOptText(60),
  serialNo: zOptText(60),
  qty: z.coerce.number().int().min(1, "Quantity must be at least 1").max(10000),
  installDate: zOptDate,
  lastRefillDate: zOptDate,
  refillIntervalMonths: zInterval,
  nextDueDate: zOptDate,
  hptDueDate: zOptDate,
  notes: zOptText(1000),
});

async function assertCustomer(customerId: number) {
  const db = await getDb();
  const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!c) throw new UserError("Choose a valid customer");
}

function assertNotFuture(...dates: (string | undefined)[]) {
  const max = addDays(todayIST(), 1);
  if (dates.some((d) => d && d > max)) throw new UserError("Install / last refill date cannot be in the future");
}

/** Create or update a single asset. Next due = (last refill || install || today) + interval unless entered explicitly (rule 8). */
export async function saveAsset(form: FormData) {
  const user = await requireWrite("refills");
  const db = await getDb();
  const rawId = Number(form.get("id")) || 0;
  let target = "/refills";
  try {
    const d = AssetInput.parse(Object.fromEntries(form));
    await assertCustomer(d.customerId);
    assertNotFuture(d.installDate, d.lastRefillDate);
    const base = d.lastRefillDate ?? d.installDate ?? todayIST();
    const values = {
      customerId: d.customerId, location: d.location ?? null, extType: d.extType, make: d.make ?? null, serialNo: d.serialNo ?? null,
      qty: d.qty, installDate: d.installDate ?? null, lastRefillDate: d.lastRefillDate ?? null, refillIntervalMonths: d.refillIntervalMonths,
      hptDueDate: d.hptDueDate ?? null, notes: d.notes ?? null,
    };
    if (d.id) {
      const [ex] = await db.select().from(extinguisherAssets).where(eq(extinguisherAssets.id, d.id)).limit(1);
      if (!ex) throw new UserError("Asset not found");
      const scheduleChanged = ex.lastRefillDate !== values.lastRefillDate || ex.installDate !== values.installDate || ex.refillIntervalMonths !== values.refillIntervalMonths;
      const nextDueDate = d.nextDueDate && d.nextDueDate !== ex.nextDueDate ? d.nextDueDate : scheduleChanged ? computeNextDue(base, d.refillIntervalMonths) : ex.nextDueDate;
      await db.update(extinguisherAssets).set({ ...values, nextDueDate }).where(eq(extinguisherAssets.id, d.id));
      await audit(db, user.id, "update", "extinguisher_asset", d.id, { ...values, nextDueDate });
      target = flashUrl(`/refills/${d.id}`, "ok", "Asset saved");
    } else {
      const nextDueDate = d.nextDueDate ?? computeNextDue(base, d.refillIntervalMonths);
      const [row] = await db.insert(extinguisherAssets).values({ ...values, nextDueDate, status: "active" }).returning({ id: extinguisherAssets.id });
      await audit(db, user.id, "create", "extinguisher_asset", row.id, { ...values, nextDueDate });
      target = flashUrl(`/refills/${row.id}`, "ok", `Asset added — next refill due ${nextDueDate}`);
    }
  } catch (e) {
    target = flashUrl(rawId > 0 ? `/refills/${rawId}` : "/refills/new", "err", errMsg(e));
  }
  revalidatePath("/refills");
  redirect(target);
}

const BulkRow = z.object({
  extType: zText(60, "Type"),
  make: z.string().trim().max(60).optional().default(""),
  qty: z.coerce.number().int().min(1, "Quantity must be at least 1").max(10000),
  location: z.string().trim().max(200).optional().default(""),
});
const BulkInput = z.object({
  customerId: zId,
  location: zOptText(200),
  dateKind: z.enum(["lastRefill", "install"]),
  baseDate: zDate,
  refillIntervalMonths: zInterval,
  hptDueDate: zOptDate,
});

/** Add many assets for one customer site in one go (e.g. a full factory survey). */
export async function bulkAddAssets(form: FormData) {
  const user = await requireWrite("refills");
  const db = await getDb();
  let target = "/refills";
  try {
    const d = BulkInput.parse(Object.fromEntries(form));
    let raw: unknown = [];
    try { raw = JSON.parse(String(form.get("rows") ?? "[]")); } catch { throw new UserError("Row data is invalid"); }
    const rows = z.array(BulkRow).min(1, "Add at least one row").max(200, "Maximum 200 rows at a time").parse(raw);
    await assertCustomer(d.customerId);
    assertNotFuture(d.baseDate);
    const nextDueDate = computeNextDue(d.baseDate, d.refillIntervalMonths);
    const values = rows.map((r) => ({
      customerId: d.customerId,
      location: r.location || d.location || null,
      extType: r.extType,
      make: r.make || null,
      qty: r.qty,
      installDate: d.dateKind === "install" ? d.baseDate : null,
      lastRefillDate: d.dateKind === "lastRefill" ? d.baseDate : null,
      refillIntervalMonths: d.refillIntervalMonths,
      nextDueDate,
      hptDueDate: d.hptDueDate ?? null,
      status: "active",
    }));
    const inserted = await db.transaction(async (tx) => tx.insert(extinguisherAssets).values(values).returning({ id: extinguisherAssets.id }));
    const units = rows.reduce((s, r) => s + r.qty, 0);
    await audit(db, user.id, "create", "extinguisher_asset", null, { bulk: true, customerId: d.customerId, ids: inserted.map((r) => r.id), units });
    target = flashUrl(`/refills?customerId=${d.customerId}`, "ok", `${inserted.length} asset line${inserted.length === 1 ? "" : "s"} (${units} units) added — next refill due ${nextDueDate}`);
  } catch (e) {
    target = flashUrl("/refills/new", "err", errMsg(e));
  }
  revalidatePath("/refills");
  redirect(target);
}

export async function setAssetStatus(form: FormData) {
  const user = await requireWrite("refills");
  const db = await getDb();
  const id = Number(form.get("id")) || 0;
  let target = "/refills";
  try {
    const status = z.enum(["active", "retired"]).parse(form.get("status"));
    const [ex] = await db.select({ id: extinguisherAssets.id, status: extinguisherAssets.status }).from(extinguisherAssets).where(eq(extinguisherAssets.id, id)).limit(1);
    if (!ex) throw new UserError("Asset not found");
    await db.update(extinguisherAssets).set({ status }).where(eq(extinguisherAssets.id, id));
    await audit(db, user.id, "update", "extinguisher_asset", id, { status: [ex.status, status] });
    target = flashUrl(`/refills/${id}`, "ok", status === "retired" ? "Asset retired — it will no longer appear in due lists" : "Asset re-activated");
  } catch (e) {
    target = flashUrl(id > 0 ? `/refills/${id}` : "/refills", "err", errMsg(e));
  }
  revalidatePath("/refills");
  redirect(target);
}

const KIND_KEYS = Object.keys(REFILL_KINDS) as [RefillKind, ...RefillKind[]];
const RefillInput = z.object({
  ids: z.array(zId).min(1, "Select at least one asset").max(500),
  date: zDate,
  kind: z.enum(KIND_KEYS),
  amount: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(0).max(1e9).optional()),
  notes: zOptText(1000),
  hptDueDate: zOptDate,
});

/**
 * Record a refill/service/HPT/replacement for one or more assets.
 * refill & replacement → lastRefillDate = date, nextDueDate = date + interval (rule 8).
 * hpt → hptDueDate = given date or date + 5 years.
 */
export async function recordRefill(form: FormData) {
  const user = await requireWrite("refills");
  const db = await getDb();
  const back = String(form.get("back") || "/refills");
  const safeBack = back.startsWith("/refills") ? back : "/refills";
  let target = safeBack;
  try {
    const d = RefillInput.parse({
      ids: form.getAll("ids"), date: form.get("date"), kind: form.get("kind"), amount: form.get("amount"),
      notes: form.get("notes"), hptDueDate: form.get("hptDueDate"),
    });
    assertNotFuture(d.date);
    const assets = await db.select().from(extinguisherAssets).where(inArray(extinguisherAssets.id, d.ids));
    if (assets.length !== new Set(d.ids).size) throw new UserError("One of the selected assets no longer exists");
    // amount is for the whole job; spread across assets by quantity for the per-asset service record
    const units = assets.reduce((s, a) => s + a.qty, 0) || 1;
    await db.transaction(async (tx) => {
      for (const a of assets) {
        await tx.insert(refillServices).values({
          assetId: a.id, date: d.date, kind: d.kind, notes: d.notes ?? null, userId: user.id,
          amount: d.amount != null ? round2((d.amount * a.qty) / units) : null,
        });
        const patch: Partial<typeof extinguisherAssets.$inferInsert> = {};
        if (d.kind === "refill" || d.kind === "replacement") {
          patch.lastRefillDate = d.date;
          patch.nextDueDate = computeNextDue(d.date, a.refillIntervalMonths);
          if (d.kind === "replacement") patch.installDate = d.date;
        }
        if (d.kind === "hpt" || d.hptDueDate) patch.hptDueDate = d.hptDueDate ?? addMonths(d.date, HPT_INTERVAL_MONTHS);
        if (a.status === "retired" && d.kind === "replacement") patch.status = "active";
        if (Object.keys(patch).length) await tx.update(extinguisherAssets).set(patch).where(eq(extinguisherAssets.id, a.id));
      }
    });
    for (const a of assets) await audit(db, user.id, "create", "refill_service", a.id, { kind: d.kind, date: d.date, amount: d.amount ?? null });
    target = flashUrl(safeBack, "ok", `${REFILL_KINDS[d.kind]} recorded for ${assets.length} asset${assets.length === 1 ? "" : "s"}`);
  } catch (e) {
    target = flashUrl(safeBack, "err", errMsg(e));
  }
  revalidatePath("/refills");
  redirect(target);
}
