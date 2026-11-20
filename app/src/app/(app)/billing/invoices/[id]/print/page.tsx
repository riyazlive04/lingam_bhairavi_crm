import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, items, projects, salesInvoiceLines, salesInvoices, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, money, qty, round2 } from "@/lib/format";
import { amountInWords, getCompany } from "@/lib/billing";
import { LinkButton } from "@/components/ui";
import { PrintButton } from "../../../../orders/_components/print-button";

export const metadata = { title: "Tax invoice" };

const td = "border border-line px-2 py-1.5";

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
  const rates = [...byRate.entries()].sort((a, b) => a[0] - b[0]);
  const tax = Number(inv.taxAmount);
  const halfA = round2(tax / 2);

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <LinkButton href={`/billing/invoices/${inv.id}`} variant="ghost">← Back to {inv.number}</LinkButton>
        <PrintButton label="Print / Save PDF" />
      </div>
      {inv.status === "cancelled" && <p className="mb-2 text-center text-lg font-bold uppercase text-red-600">Cancelled</p>}
      <article className="print-area mx-auto max-w-4xl rounded-xl border border-line bg-surface p-4 text-sm text-ink shadow-sm sm:p-8 print:max-w-none print:p-0">
        <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-brand-700 print:text-black">{company.name}</h1>
            <p className="whitespace-pre-line text-ink-soft">{company.address}</p>
            {company.gstin && <p>GSTIN: <strong>{company.gstin}</strong>{company.pan ? ` · PAN: ${company.pan}` : ""}</p>}
            <p className="text-ink-soft">{[company.phone && `Ph: ${company.phone}`, company.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-lg font-semibold uppercase tracking-wide">Tax Invoice</p>
            <p>Invoice no: <strong>{inv.number}</strong></p>
            <p>Date: {fmtDate(inv.invoiceDate)}</p>
            <p>Due date: {fmtDate(inv.dueDate)}</p>
          </div>
        </header>

        <section className="grid gap-4 border-b border-line py-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Bill to</p>
            <p className="font-semibold">{c.name}</p>
            <p className="whitespace-pre-line">{c.address || ""}{c.city ? `\n${c.city}` : ""}{c.state ? `, ${c.state}` : ""}</p>
            <p>GSTIN: {c.gstin || "Unregistered"}</p>
          </div>
          <div className="space-y-0.5 sm:text-right">
            {row.po && <p>Buyer&apos;s PO: <strong>{row.po}</strong>{row.poDate ? ` dt ${fmtDate(row.poDate)}` : ""}</p>}
            {row.projectName && <p>Project: {row.projectName}</p>}
            {row.site && <p className="whitespace-pre-line">Site: {row.site}</p>}
            <p>Place of supply: {c.state || company.state}</p>
            <p>Tax: {intra ? "CGST + SGST" : "IGST"}</p>
          </div>
        </section>

        <div className="overflow-x-auto py-4">
          <table className="w-full min-w-max border-collapse">
            <thead>
              <tr className="bg-muted print:bg-transparent">
                <th className={`${td} text-left`}>#</th><th className={`${td} text-left`}>Description</th><th className={`${td} text-left`}>HSN/SAC</th>
                <th className={`${td} text-right`}>Qty</th><th className={`${td} text-right`}>Rate</th><th className={`${td} text-right`}>Taxable value</th><th className={`${td} text-right`}>GST %</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ l, hsn, uom }, i) => (
                <tr key={l.id}>
                  <td className={td}>{i + 1}</td>
                  <td className={`${td} whitespace-normal`}>{l.description}</td>
                  <td className={td}>{hsn || "—"}</td>
                  <td className={`${td} text-right tabular-nums`}>{qty(l.qty)} {uom ?? ""}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(l.rate)}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(l.amount)}</td>
                  <td className={`${td} text-right tabular-nums`}>{l.gstRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead><tr className="bg-muted print:bg-transparent">
                <th className={`${td} text-left`}>GST rate</th><th className={`${td} text-right`}>Taxable</th>
                {intra ? <><th className={`${td} text-right`}>CGST</th><th className={`${td} text-right`}>SGST</th></> : <th className={`${td} text-right`}>IGST</th>}
              </tr></thead>
              <tbody>
                {rates.map(([r, v]) => (
                  <tr key={r}>
                    <td className={td}>{r}%</td><td className={`${td} text-right tabular-nums`}>{money(v.taxable)}</td>
                    {intra ? <><td className={`${td} text-right tabular-nums`}>{money(round2(v.tax / 2))}</td><td className={`${td} text-right tabular-nums`}>{money(round2(v.tax - round2(v.tax / 2)))}</td></>
                      : <td className={`${td} text-right tabular-nums`}>{money(v.tax)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="space-y-1">
            <div className="flex justify-between"><dt>Taxable value</dt><dd className="tabular-nums">{money(inv.subtotal)}</dd></div>
            {intra ? (
              <>
                <div className="flex justify-between"><dt>CGST</dt><dd className="tabular-nums">{money(halfA)}</dd></div>
                <div className="flex justify-between"><dt>SGST</dt><dd className="tabular-nums">{money(round2(tax - halfA))}</dd></div>
              </>
            ) : <div className="flex justify-between"><dt>IGST</dt><dd className="tabular-nums">{money(tax)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><dt>Invoice total</dt><dd className="tabular-nums">{money(inv.total)}</dd></div>
            {Number(inv.paidAmount) > 0 && <div className="flex justify-between text-ink-soft"><dt>Received</dt><dd className="tabular-nums">{money(inv.paidAmount)}</dd></div>}
          </dl>
        </section>
        <p className="mt-3 border-y border-line py-2"><span className="text-ink-soft">Amount in words:</span> <strong>{amountInWords(Number(inv.total))}</strong></p>

        {inv.notes && <p className="mt-3 whitespace-pre-line"><strong>Notes:</strong> {inv.notes}</p>}
        {company.bank && <p className="mt-3"><strong>Bank details:</strong> {company.bank}</p>}
        <p className="mt-3 text-xs text-ink-soft">Payment due within {c.paymentTermsDays} days of invoice date. Interest may be charged on overdue amounts. Subject to Hosur jurisdiction. E. &amp; O.E.</p>

        <footer className="mt-10 flex justify-end">
          <div className="text-right">
            <p className="text-xs">For {company.name}</p>
            <div className="h-12" />
            <p className="border-t border-line pt-1">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </>
  );
}
