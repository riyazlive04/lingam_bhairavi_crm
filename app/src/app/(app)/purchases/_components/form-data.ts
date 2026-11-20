import "server-only";
import { asc, eq, inArray, ne, or } from "drizzle-orm";
import type { DB } from "@/db";
import { items, projects, vendorItems, vendors } from "@/db/schema";
import { latestCostOf } from "@/lib/items";
import type { PFItem, PFProject, PFVendor } from "./purchase-form";

/** Serialisable lookups for the purchase invoice line editor. */
export async function purchaseFormData(db: DB, includeItemIds: number[] = []) {
  const [vs, ps, its, vis] = await Promise.all([
    db.select({ id: vendors.id, name: vendors.name, paymentTermsDays: vendors.paymentTermsDays, active: vendors.active }).from(vendors).orderBy(asc(vendors.name)),
    db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).where(ne(projects.status, "closed")).orderBy(asc(projects.code)),
    db.select({ it: items, vendorName: vendors.name }).from(items).leftJoin(vendors, eq(vendors.id, items.lastPurchaseVendorId))
      .where(includeItemIds.length ? or(eq(items.active, true), inArray(items.id, includeItemIds)) : eq(items.active, true)).orderBy(asc(items.code)),
    db.select({ vendorId: vendorItems.vendorId, itemId: vendorItems.itemId, lastRate: vendorItems.lastRate, lastDate: vendorItems.lastDate }).from(vendorItems),
  ]);
  const vendorList: (PFVendor & { active: boolean })[] = vs;
  const projectList: PFProject[] = ps;
  const itemList: PFItem[] = its.map(({ it, vendorName }) => {
    const c = latestCostOf(it);
    return {
      id: it.id, code: it.code, name: it.name, size: it.size, make: it.make, uom: it.uom, gstRate: it.gstRate,
      latestRate: c.rate, latestDate: c.date, latestVendor: c.source === "purchase" ? vendorName : null,
    };
  });
  const vendorRates: Record<string, Record<string, { rate: number | null; date: string | null }>> = {};
  for (const r of vis) {
    (vendorRates[String(r.vendorId)] ??= {})[String(r.itemId)] = { rate: r.lastRate, date: r.lastDate };
  }
  return { vendors: vendorList, projects: projectList, items: itemList, vendorRates };
}
