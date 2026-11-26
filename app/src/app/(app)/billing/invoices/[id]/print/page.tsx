import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, items, projects, salesInvoiceLines, salesInvoices, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, money, qty, round2 } from "@/lib/format";
import { amountInWords, getCompany } from "@/lib/billing";
import { DocNotes, DocSignature, DocTable, DocTotals, DocumentSheet, GstSummaryTable } from "@/components/patterns";

export const metadata = { title: "Tax invoice" };

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("billing");
  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) notFound();
  const db = await getDb();
  const [row] = await db.select({ inv: salesInvoices, c: customers, po: salesOrders.customerPoNumber, poDate: salesOrders.customerPoDate, projectName: projects.name, site: projects.siteAddress })
    .from(salesInvoices)
    .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
    .leftJoin(salesOrders, eq(salesOrders.id, salesInvoices.orderId))
    .leftJoin(projects, eq(projects.id, salesInvoices.projectId))
    .where(eq(salesInvoices.id, invoiceId));
  if (!row) notFound();
  const { inv, c } = row;
  const lines = await db.select({ l: salesInvoiceLines, hsn: items.hsn, uom: items.uom }).from(salesInvoiceLines)
    .leftJoin(items, eq(items.id, salesInvoiceLines.itemId)).where(eq(salesInvoiceLines.invoiceId, invoiceId)).orderBy(asc(salesInvoiceLines.id));
  const company = await getCompany(db);

  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  // GSTIN's first 2 digits = state code; fall back to state names
  const intra = company.gstin && c.gstin ? company.gstin.slice(0, 2) === c.gstin.slice(0, 2) : norm(c.state || "Tamil Nadu") === norm(company.state);

  // GST summary by rate
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const { l } of lines) {
    const r = Number(l.gstRate), cur = byRate.get(r) ?? { taxable: 0, tax: 0 };
    cur.taxable = round2(cur.taxable + Number(l.amount));
    cur.tax = round2(cur.tax + (Number(l.amount) * r) / 100);
    byRate.set(r, cur);
  }
  const summary = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => {
    const cgst = intra ? round2(v.tax / 2) : 0;
    return { rate, taxable: v.taxable, cgst, sgst: intra ? round2(v.tax - cgst) : 0, igst: intra ? 0 : v.tax };
  });
  const tax = Number(inv.taxAmount);
  const halfA = round2(tax / 2);

  const facts: [string, string][] = [];
  if (row.po) facts.push(["Buyer's PO", `${row.po}${row.poDate ? ` dated ${fmtDate(row.poDate)}` : ""}`]);
  if (row.projectName) facts.push(["Project", row.projectName]);
  if (row.site) facts.push(["Site", row.site]);
  facts.push(["Place of supply", c.state || company.state || "-"], ["Tax", intra ? "CGST + SGST" : "IGST"]);

  return (
    <DocumentSheet
      company={company}
      title="Tax invoice"
      numberLabel="Invoice no."
      number={inv.number}
      date={fmtDate(inv.invoiceDate)}
      meta={[["Due date", fmtDate(inv.dueDate)]]}
      party={{ label: "Bill to", name: c.name, address: c.address, city: c.city, state: c.state, gstin: c.gstin }}
      facts={facts}
      watermark={inv.status === "cancelled" ? "Cancelled" : undefined}
      toolbar={{ backHref: `/billing/invoices/${inv.id}`, backLabel: `Back to ${inv.number}` }}
    >
      <DocTable>
        <thead>
          <tr>
            <th>#</th><th>Description</th><th>HSN/SAC</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Taxable value</th><th className="num">GST %</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ l, hsn, uom }, i) => (
            <tr key={l.id}>
              <td>{i + 1}</td>
              <td className="whitespace-normal">{l.description}</td>
              <td>{hsn || "-"}</td>
              <td className="num">{qty(l.qty)} {uom ?? ""}</td>
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
          taxable={Number(inv.subtotal)}
          {...(intra ? { cgst: halfA, sgst: round2(tax - halfA) } : { igst: tax })}
          total={Number(inv.total)}
          totalLabel="Invoice total"
          note={Number(inv.paidAmount) > 0 ? `Received so far: ${money(inv.paidAmount)}` : undefined}
          words={amountInWords(Number(inv.total))}
        />
      </section>

      <DocNotes title="Terms">
        {inv.notes && <p className="whitespace-pre-line"><strong>Notes:</strong> {inv.notes}</p>}
        {company.bank && <p><strong>Bank details:</strong> {company.bank}</p>}
        <p>Payment due within {c.paymentTermsDays} days of invoice date. Interest may be charged on overdue amounts. Subject to Hosur jurisdiction. E. &amp; O.E.</p>
      </DocNotes>

      <DocSignature company={company.name} left="Received by (name and signature)" />
    </DocumentSheet>
  );
}
