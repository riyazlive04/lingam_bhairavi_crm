import { notFound, redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { purchaseOrderLines, purchaseOrders, salesOrderLines } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { qty } from "@/lib/format";
import { Flash } from "@/components/ui";
import { FormPage } from "@/components/patterns";
import { PurchaseOrderForm } from "../../_components/po-form";
import { poFormData } from "../../_lib/data";
import { savePurchaseOrder } from "../../actions";

export const metadata = { title: "Edit purchase order" };

export default async function EditPurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("purchaseOrders");
  if (!canWrite(user.role, "purchaseOrders")) redirect("/forbidden");
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await searchParams;
  const db = await getDb();
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!po) notFound();
  if (po.status !== "draft") redirect(`/purchase-orders/${id}?err=` + encodeURIComponent("Only a draft PO can be edited"));
  const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id)).orderBy(asc(purchaseOrderLines.sortOrder), asc(purchaseOrderLines.id));
  const solIds = lines.map((l) => l.salesOrderLineId).filter((x): x is number => x != null);
  const [data, sol] = await Promise.all([
    poFormData(db, { includeItemIds: lines.map((l) => l.itemId), includeSalesOrderId: po.salesOrderId }),
    solIds.length ? db.select({ id: salesOrderLines.id, qty: salesOrderLines.qty, deliveredQty: salesOrderLines.deliveredQty }).from(salesOrderLines).where(inArray(salesOrderLines.id, solIds)) : Promise.resolve([]),
  ]);
  const solById = new Map(sol.map((s) => [s.id, s]));

  return (
    <FormPage width="wide" eyebrow="Purchase order" title={`Edit draft ${po.number}`} back={{ href: `/purchase-orders/${id}`, label: po.number }}
      notices={sp.err ? <Flash err={sp.err} /> : undefined}>
      <PurchaseOrderForm
        action={savePurchaseOrder}
        id={po.id}
        vendors={data.vendors.filter((v) => v.active || v.id === po.vendorId)}
        projects={data.projects}
        salesOrders={data.salesOrders}
        items={data.items}
        vendorRates={data.vendorRates}
        initial={{
          vendorId: po.vendorId, poDate: po.poDate, expectedDate: po.expectedDate ?? "", salesOrderId: po.salesOrderId, projectId: po.projectId,
          terms: po.terms ?? "", notes: po.notes ?? "",
          lines: lines.map((l) => {
            const s = l.salesOrderLineId != null ? solById.get(l.salesOrderLineId) : undefined;
            return {
              key: `l${l.id}`, itemId: l.itemId, description: l.description ?? "", qty: l.qty, rate: l.rate, gstRate: l.gstRate,
              salesOrderLineId: l.salesOrderLineId, rateTouched: true,
              soInfo: s ? `${qty(s.qty)} ordered by customer, ${qty(s.deliveredQty)} delivered` : undefined,
            };
          }),
        }}
      />
    </FormPage>
  );
}
