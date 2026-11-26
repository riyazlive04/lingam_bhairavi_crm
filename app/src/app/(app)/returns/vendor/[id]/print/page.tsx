import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items, purchaseInvoices, purchaseReturnLines, purchaseReturns, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, money, qty, round2 } from "@/lib/format";
import { amountInWords, getCompany } from "@/lib/billing";
import { gstSummary, isIntraState } from "@/lib/returns";
import { DocNotes, DocSignature, DocTable, DocTotals, DocumentSheet, GstSummaryTable } from "@/components/patterns";

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

  const lineData = lines.map(({ l, name, hsn, uom }) => ({ id: l.id, description: name, hsn, uom, qty: Number(l.qty), rate: Number(l.rate), gstRate: Number(l.gstRate), amount: Number(l.amount) }));
  const intra = isIntraState(company, party);
  const summary = gstSummary(lineData, intra);
  const subtotal = Number(r.subtotal), taxAmount = Number(r.taxAmount), total = Number(r.total);
  const cgst = round2(summary.reduce((s, x) => s + x.cgst, 0));
  const sgst = round2(summary.reduce((s, x) => s + x.sgst, 0));
  const meta: [string, ReactNode][] = [];
  if (row.billNo) meta.push(["Your invoice", <span key="b"><strong>{row.billNo}</strong> dated {fmtDate(row.billDate)}</span>]);

  return (
    <DocumentSheet
      company={company}
      title="Debit note"
      numberLabel="Debit note no."
      number={r.number}
      date={fmtDate(r.date)}
      meta={meta}
      party={{ label: "Issued to (supplier)", ...party }}
      facts={[["Place of supply", company.state], ["Tax", intra ? "CGST + SGST" : "IGST"], ["Reason", r.reason || "Goods returned"]]}
      watermark={r.status === "cancelled" ? "Cancelled" : undefined}
      toolbar={{ backHref: `/returns/vendor/${r.id}`, backLabel: `Back to ${r.number}` }}
    >
      <DocTable>
        <thead>
          <tr>
            <th>#</th><th>Description</th><th>HSN/SAC</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Taxable value</th><th className="num">GST %</th>
          </tr>
        </thead>
        <tbody>
          {lineData.map((l, i) => (
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
          totalLabel="Debit note total"
          note={intra && Math.abs(round2(cgst + sgst) - round2(taxAmount)) > 0.01 ? "Rounded to the document total" : undefined}
          words={amountInWords(total)}
        />
      </section>

      <DocNotes>
        <p>Issued for goods returned to the supplier. Please adjust this amount{row.billNo ? ` against invoice ${row.billNo}` : ""} or send us a credit note. E. &amp; O.E.</p>
      </DocNotes>

      <DocSignature company={company.name} />
    </DocumentSheet>
  );
}
