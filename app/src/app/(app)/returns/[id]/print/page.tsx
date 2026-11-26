import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, items, salesInvoices, salesOrders, salesReturnLines, salesReturns } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, money, qty, round2 } from "@/lib/format";
import { amountInWords, getCompany } from "@/lib/billing";
import { gstSummary, isIntraState, reasonLabel } from "@/lib/returns";
import { DocNotes, DocSignature, DocTable, DocTotals, DocumentSheet, GstSummaryTable } from "@/components/patterns";

/**
 * REFERENCE DOCUMENT PAGE (design system v2). Every printable document copies this structure:
 * DocumentSheet (letterhead, number, party, facts, watermark, toolbar) > DocTable lines >
 * GstSummaryTable + DocTotals > DocNotes > DocSignature.
 */
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
  const [lineRows, company] = await Promise.all([
    db.select({ l: salesReturnLines, hsn: items.hsn, uom: items.uom }).from(salesReturnLines).leftJoin(items, eq(items.id, salesReturnLines.itemId))
      .where(eq(salesReturnLines.returnId, returnId)).orderBy(asc(salesReturnLines.id)),
    getCompany(db),
  ]);
  const lines = lineRows.map(({ l, hsn, uom }) => ({ id: l.id, description: l.description, hsn, uom, qty: Number(l.qty), rate: Number(l.rate), gstRate: Number(l.gstRate), amount: Number(l.amount) }));
  const intra = isIntraState(company, c);
  const summary = gstSummary(lines, intra);
  const subtotal = Number(r.subtotal), taxAmount = Number(r.taxAmount), total = Number(r.total);
  const cgst = round2(summary.reduce((s, x) => s + x.cgst, 0));
  const sgst = round2(summary.reduce((s, x) => s + x.sgst, 0));

  const meta: [string, ReactNode][] = [];
  if (row.invNo) meta.push(["Original invoice", <span key="i"><strong>{row.invNo}</strong> dated {fmtDate(row.invDate)}</span>]);
  if (row.orderNo) meta.push(["Our order", `${row.orderNo}${row.po ? ` (your PO ${row.po})` : ""}`]);

  return (
    <DocumentSheet
      company={company}
      title="Credit note"
      numberLabel="Credit note no."
      number={r.number}
      date={fmtDate(r.date)}
      meta={meta}
      party={{ label: "Issued to", name: c.name, address: c.address, city: c.city, state: c.state, gstin: c.gstin }}
      facts={[["Place of supply", c.state || company.state], ["Tax", intra ? "CGST + SGST" : "IGST"], ["Reason", reasonLabel(r.reason)]]}
      watermark={r.status === "cancelled" ? "Cancelled" : undefined}
      toolbar={{ backHref: `/returns/${r.id}`, backLabel: `Back to ${r.number}` }}
    >
      <DocTable>
        <thead>
          <tr>
            <th>#</th><th>Description</th><th>HSN/SAC</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Taxable value</th><th className="num">GST %</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td>{i + 1}</td>
              <td className="whitespace-normal">{l.description}</td>
              <td>{l.hsn || "-"}</td>
              <td className="num">{qty(l.qty)} {l.uom ?? ""}</td>
              <td className="num">{money(l.rate)}</td>
              <td className="num">{money(l.amount)}</td>
              <td className="num">{l.gstRate}%</td>
            </tr>
          ))}
        </tbody>
      </DocTable>

      <section className="grid gap-4 sm:grid-cols-2">
        <GstSummaryTable intra={intra} rows={summary} />
        <DocTotals
          taxable={subtotal}
          {...(intra ? { cgst, sgst: round2(taxAmount - cgst) } : { igst: taxAmount })}
          total={total}
          totalLabel="Credit note total"
          note={intra && Math.abs(round2(cgst + sgst) - round2(taxAmount)) > 0.01 ? "Rounded to the document total" : undefined}
          words={amountInWords(total)}
        />
      </section>

      <DocNotes>
        <p>Issued for goods returned by the customer. This credit note reduces the amount payable{row.invNo ? ` against invoice ${row.invNo}` : ""}. E. &amp; O.E.</p>
      </DocNotes>

      <DocSignature company={company.name} />
    </DocumentSheet>
  );
}
