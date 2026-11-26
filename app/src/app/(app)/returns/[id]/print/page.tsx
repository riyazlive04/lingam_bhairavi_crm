import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, items, salesInvoices, salesOrders, salesReturnLines, salesReturns } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { getCompany } from "@/lib/billing";
import { isIntraState, reasonLabel } from "@/lib/returns";
import { LinkButton } from "@/components/ui";
import { PrintButton } from "../../../orders/_components/print-button";
import { NotePrint } from "../../_components/note-print";

export const metadata = { title: "Credit note" };

export default async function CreditNotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("returns");
  const { id } = await params;
  const returnId = Number(id);
  if (!Number.isInteger(returnId) || returnId <= 0) notFound();
  const db = await getDb();
  const [row] = await db.select({ r: salesReturns, c: customers, invNo: salesInvoices.number, invDate: salesInvoices.invoiceDate, orderNo: salesOrders.number, po: salesOrders.customerPoNumber })
    .from(salesReturns).innerJoin(customers, eq(customers.id, salesReturns.customerId))
    .leftJoin(salesInvoices, eq(salesInvoices.id, salesReturns.salesInvoiceId))
    .leftJoin(salesOrders, eq(salesOrders.id, salesReturns.orderId))
    .where(eq(salesReturns.id, returnId));
  if (!row) notFound();
  if (row.r.status === "draft") redirect(`/returns/${returnId}?err=` + encodeURIComponent("Post the credit note before printing it"));
  const { r, c } = row;
  const [lines, company] = await Promise.all([
    db.select({ l: salesReturnLines, hsn: items.hsn, uom: items.uom }).from(salesReturnLines).leftJoin(items, eq(items.id, salesReturnLines.itemId))
      .where(eq(salesReturnLines.returnId, returnId)).orderBy(asc(salesReturnLines.id)),
    getCompany(db),
  ]);
  const refs = [
    row.invNo ? <>Original invoice: <strong>{row.invNo}</strong> dt {fmtDate(row.invDate)}</> : null,
    row.orderNo ? <>Our order: {row.orderNo}{row.po ? ` (your PO ${row.po})` : ""}</> : null,
  ].filter(Boolean);

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <LinkButton href={`/returns/${r.id}`} variant="ghost">← Back to {r.number}</LinkButton>
        <PrintButton label="Print / Save PDF" />
      </div>
      <NotePrint
        title="Credit Note" company={company} partyLabel="Issued to" numberLabel="Credit note no" number={r.number} date={r.date}
        party={{ name: c.name, address: c.address, city: c.city, state: c.state, gstin: c.gstin }} refs={refs} reason={reasonLabel(r.reason)}
        lines={lines.map(({ l, hsn, uom }) => ({ id: l.id, description: l.description, hsn, uom, qty: Number(l.qty), rate: Number(l.rate), gstRate: Number(l.gstRate), amount: Number(l.amount) }))}
        subtotal={Number(r.subtotal)} taxAmount={Number(r.taxAmount)} total={Number(r.total)} intra={isIntraState(company, c)} cancelled={r.status === "cancelled"}
        footerNote={`Issued for goods returned by the customer. This credit note reduces the amount payable${row.invNo ? ` against invoice ${row.invNo}` : ""}. E. & O.E.`}
      />
    </>
  );
}
