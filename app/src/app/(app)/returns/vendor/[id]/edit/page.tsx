import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { purchaseInvoices, purchaseReturnLines, purchaseReturns, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { returnablePurchaseLines } from "@/lib/returns";
import { Flash, PageHeader } from "@/components/ui";
import { VendorReturnForm } from "../../../_components/vendor-return-form";
import { toVendorEditorLines } from "../../../_components/lines";

export const metadata = { title: "Edit return to vendor" };

export default async function EditVendorReturnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("returns");
  const { id } = await params;
  const sp = await searchParams;
  const returnId = Number(id);
  if (!Number.isInteger(returnId) || returnId <= 0) notFound();
  if (!canWrite(user.role, "returns")) redirect(`/returns/vendor/${returnId}?err=` + encodeURIComponent("You do not have permission to change returns"));
  const db = await getDb();
  const [row] = await db.select({ r: purchaseReturns, vendorName: vendors.name, billNo: purchaseInvoices.invoiceNo, billDate: purchaseInvoices.invoiceDate })
    .from(purchaseReturns).innerJoin(vendors, eq(vendors.id, purchaseReturns.vendorId))
    .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, purchaseReturns.purchaseInvoiceId))
    .where(eq(purchaseReturns.id, returnId));
  if (!row) notFound();
  const { r } = row;
  if (r.status !== "draft") redirect(`/returns/vendor/${returnId}?err=` + encodeURIComponent("Only a draft can be edited"));
  if (!r.purchaseInvoiceId) redirect(`/returns/vendor/${returnId}?err=` + encodeURIComponent("This draft is not linked to a bill. Delete it and start again from the bill"));
  const [avail, saved] = await Promise.all([
    returnablePurchaseLines(db, r.purchaseInvoiceId),
    db.select().from(purchaseReturnLines).where(eq(purchaseReturnLines.returnId, returnId)),
  ]);
  const savedMap = new Map(saved.filter((s) => s.purchaseInvoiceLineId != null)
    .map((s) => [String(s.purchaseInvoiceLineId), { qty: Number(s.qty), rate: Number(s.rate), gstRate: Number(s.gstRate) }]));

  return (
    <>
      <PageHeader title="Edit draft debit note" subtitle={row.vendorName} back={{ href: `/returns/vendor/${returnId}`, label: "Draft debit note" }} />
      <Flash err={sp.err} />
      <VendorReturnForm
        returnId={returnId}
        purchaseInvoiceId={r.purchaseInvoiceId}
        details={[["Vendor", row.vendorName], ["Vendor bill", row.billNo ? `${row.billNo} dated ${fmtDate(row.billDate)}` : "-"]]}
        lines={toVendorEditorLines(avail, savedMap)}
        date={r.date}
        reason={r.reason}
      />
    </>
  );
}
