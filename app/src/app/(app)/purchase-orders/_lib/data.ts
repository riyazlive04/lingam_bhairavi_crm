import "server-only";
import { desc, eq, inArray, notInArray, or } from "drizzle-orm";
import type { DB } from "@/db";
import { customers, salesOrders } from "@/db/schema";
import { purchaseFormData } from "../../purchases/_components/form-data";
import type { POFSalesOrder } from "../_components/po-form";

/** Lookups for the PO editor: vendors, projects, items with latest cost, vendor rates and open customer orders. */
export async function poFormData(db: DB, opts: { includeItemIds?: number[]; includeSalesOrderId?: number | null } = {}) {
  const base = await purchaseFormData(db, opts.includeItemIds ?? []);
  const sos = await db.select({
    id: salesOrders.id, number: salesOrders.number, customerName: customers.name, projectId: salesOrders.projectId, customerPoNumber: salesOrders.customerPoNumber,
  }).from(salesOrders).leftJoin(customers, eq(customers.id, salesOrders.customerId))
    .where(opts.includeSalesOrderId
      ? or(notInArray(salesOrders.status, ["delivered", "closed", "cancelled"]), inArray(salesOrders.id, [opts.includeSalesOrderId]))
      : notInArray(salesOrders.status, ["delivered", "closed", "cancelled"]))
    .orderBy(desc(salesOrders.orderDate), desc(salesOrders.id)).limit(300);
  const salesOrderList: POFSalesOrder[] = sos.map((s) => ({ ...s, customerName: s.customerName ?? "Customer" }));
  return { ...base, salesOrders: salesOrderList };
}
