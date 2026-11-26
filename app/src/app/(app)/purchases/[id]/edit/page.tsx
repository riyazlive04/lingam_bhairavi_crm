import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { purchaseInvoiceLines, purchaseInvoices, purchaseOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Flash } from "@/components/ui";
import { FormPage } from "@/components/patterns";
import { PurchaseForm } from "../../_components/purchase-form";
import { purchaseFormData } from "../../_components/form-data";
import { updatePurchase } from "../../actions";

export const metadata = { title: "Edit purchase invoice" };

export default async function EditPurchasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("purchases");
  if (!canWrite(user.role, "purchases")) redirect("/forbidden");
  const { id } = await params;
  const sp = await searchParams;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId)) notFound();
  const db = await getDb();
  const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId));
  if (!inv) notFound();
  if (inv.status !== "draft") redirect(`/purchases/${inv.id}?err=` + encodeURIComponent("Only draft invoices can be edited"));
  const lines = await db.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, invoiceId)).orderBy(asc(purchaseInvoiceLines.id));
  const data = await purchaseFormData(db, lines.map((l) => l.itemId));
  const [po] = inv.purchaseOrderId
    ? await db.select({ id: purchaseOrders.id, number: purchaseOrders.number }).from(purchaseOrders).where(eq(purchaseOrders.id, inv.purchaseOrderId))
    : [];
  return (
    <FormPage width="wide"
      eyebrow="Purchase invoice" title={`Edit draft ${inv.invoiceNo}`} back={{ href: `/purchases/${inv.id}`, label: inv.invoiceNo }}
      notices={sp.err ? <Flash err={sp.err} /> : undefined}>
      <PurchaseForm
        editing
        action={updatePurchase.bind(null, inv.id)}
        vendors={data.vendors.filter((v) => v.active || v.id === inv.vendorId)}
        projects={data.projects}
        items={data.items}
        vendorRates={data.vendorRates}
        po={po ?? null}
        initial={{
          vendorId: inv.vendorId, invoiceNo: inv.invoiceNo, invoiceDate: inv.invoiceDate, dueDate: inv.dueDate ?? "", projectId: inv.projectId, notes: inv.notes ?? "",
          lines: lines.map((l) => ({ itemId: l.itemId, description: l.description ?? "", qty: l.qty, rate: l.rate, gstRate: l.gstRate, poLineId: po ? l.poLineId : null })),
        }}
      />
    </FormPage>
  );
}
