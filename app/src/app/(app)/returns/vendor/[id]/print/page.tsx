import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items, purchaseInvoices, purchaseReturnLines, purchaseReturns, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { getCompany } from "@/lib/billing";
import { isIntraState } from "@/lib/returns";
import { LinkButton } from "@/components/ui";
import { PrintButton } from "../../../../orders/_components/print-button";
import { NotePrint } from "../../../_components/note-print";

export const metadata = { title: "Debit note" };

export default async function DebitNotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("returns");
  const { id } = await params;
  const returnId = Number(id);
  if (!Number.isInteger(returnId) || returnId <= 0) notFound();
  const db = await getDb();
  const [row] = await db.select({ r: purchaseReturns, v: vendors, billNo: purchaseInvoices.invoiceNo, billDate: purchaseInvoices.invoiceDate })
    .from(purchaseReturns).innerJoin(vendors, eq(vendors.id, purchaseReturns.vendorId))
    .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, purchaseReturns.purchaseInvoiceId))
    .where(eq(purchaseReturns.id, returnId));
  if (!row) notFound();
  if (row.r.status === "draft") redirect(`/returns/vendor/${returnId}?err=` + encodeURIComponent("Post the debit note before printing it"));
  const { r, v } = row;
  const [lines, company] = await Promise.all([
    db.select({ l: purchaseReturnLines, name: items.name, hsn: items.hsn, uom: items.uom }).from(purchaseReturnLines)
      .innerJoin(items, eq(items.id, purchaseReturnLines.itemId)).where(eq(purchaseReturnLines.returnId, returnId)).orderBy(asc(purchaseReturnLines.id)),
    getCompany(db),
  ]);
  // vendors carry no state column: the GSTIN state code decides, else treated as same state
  const party = { name: v.name, address: v.address, city: v.city, state: null, gstin: v.gstin };

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <LinkButton href={`/returns/vendor/${r.id}`} variant="ghost">← Back to {r.number}</LinkButton>
        <PrintButton label="Print / Save PDF" />
      </div>
      <NotePrint
        title="Debit Note" company={company} partyLabel="Issued to (supplier)" numberLabel="Debit note no" number={r.number} date={r.date}
        party={party} refs={row.billNo ? [<>Against your invoice: <strong>{row.billNo}</strong> dt {fmtDate(row.billDate)}</>] : []}
        reason={r.reason || "Goods returned"}
        lines={lines.map(({ l, name, hsn, uom }) => ({ id: l.id, description: name, hsn, uom, qty: Number(l.qty), rate: Number(l.rate), gstRate: Number(l.gstRate), amount: Number(l.amount) }))}
        subtotal={Number(r.subtotal)} taxAmount={Number(r.taxAmount)} total={Number(r.total)} intra={isIntraState(company, party)} cancelled={r.status === "cancelled"}
        footerNote={`Issued for goods returned to the supplier. Please adjust this amount${row.billNo ? ` against invoice ${row.billNo}` : ""} or send us a credit note. E. & O.E.`}
      />
    </>
  );
}
