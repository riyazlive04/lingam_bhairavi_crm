import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, paymentAllocations, payments, projects, salesInvoices, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, money } from "@/lib/format";
import { amountInWords, getCompany, receiptNumber } from "@/lib/billing";
import { LinkButton } from "@/components/ui";
import { PrintButton } from "../../../orders/_components/print-button";

export const metadata = { title: "Payment receipt" };

const MODE_LABEL: Record<string, string> = { bank: "Bank transfer", upi: "UPI", cheque: "Cheque", cash: "Cash" };

export default async function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  await requireUser("billing");
  const { paymentId } = await params;
  const id = Number(paymentId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  const [row] = await db.select({ p: payments, c: customers, invNo: salesInvoices.number, invDate: salesInvoices.invoiceDate, orderNo: salesOrders.number, po: salesOrders.customerPoNumber, projectName: projects.name })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId))
    .leftJoin(salesInvoices, eq(salesInvoices.id, payments.salesInvoiceId))
    .leftJoin(salesOrders, eq(salesOrders.id, payments.orderId))
    .leftJoin(projects, eq(projects.id, payments.projectId))
    .where(eq(payments.id, id));
  if (!row || row.p.direction !== "in") notFound();
  const { p, c } = row;
  const [company, allocs] = await Promise.all([
    getCompany(db),
    p.isAdvance
      ? db.select({ id: paymentAllocations.id, amount: paymentAllocations.amount, date: paymentAllocations.date, invNo: salesInvoices.number })
        .from(paymentAllocations).innerJoin(salesInvoices, eq(salesInvoices.id, paymentAllocations.salesInvoiceId))
        .where(eq(paymentAllocations.paymentId, id)).orderBy(asc(paymentAllocations.id))
      : Promise.resolve([]),
  ]);
  const number = receiptNumber(p);
  const towards = p.isAdvance
    ? `Advance${row.orderNo ? ` against our order ${row.orderNo}${row.po ? ` (your PO ${row.po})` : ""}` : ""}${row.projectName ? `, project ${row.projectName}` : ""}`
    : row.invNo ? `Invoice ${row.invNo} dated ${fmtDate(row.invDate)}` : "On account";

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <LinkButton href={p.salesInvoiceId ? `/billing/invoices/${p.salesInvoiceId}` : p.isAdvance ? "/billing/advances" : "/billing/payments"} variant="ghost">← Back</LinkButton>
        <PrintButton label="Print / Save PDF" />
      </div>
      <article className="print-area mx-auto max-w-3xl rounded-xl border border-line bg-surface p-4 text-sm text-ink shadow-sm sm:p-8 print:max-w-none print:p-0">
        <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-brand-700 print:text-black">{company.name}</h1>
            <p className="whitespace-pre-line text-ink-soft">{company.address}</p>
            {company.gstin && <p>GSTIN: <strong>{company.gstin}</strong></p>}
            <p className="text-ink-soft">{[company.phone && `Ph: ${company.phone}`, company.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-lg font-semibold uppercase tracking-wide">{p.isAdvance ? "Advance receipt" : "Payment receipt"}</p>
            <p>Receipt no: <strong>{number}</strong></p>
            <p>Date: {fmtDate(p.date)}</p>
          </div>
        </header>

        <section className="space-y-3 py-5 text-[0.95rem] leading-relaxed">
          <p>Received with thanks from <strong>{c.name}</strong>{c.city ? `, ${c.city}` : ""}{c.gstin ? ` (GSTIN ${c.gstin})` : ""} the sum of <strong>{money(p.amount)}</strong>.</p>
          <p className="border-y border-line py-2"><span className="text-ink-soft">Amount in words:</span> <strong>{amountInWords(Number(p.amount))}</strong></p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div><dt className="text-xs text-ink-soft">Towards</dt><dd className="font-medium">{towards}</dd></div>
            <div><dt className="text-xs text-ink-soft">Mode</dt><dd className="font-medium">{MODE_LABEL[p.mode] ?? p.mode}{p.reference ? ` · Ref ${p.reference}` : ""}</dd></div>
            {p.notes && <div className="sm:col-span-2"><dt className="text-xs text-ink-soft">Notes</dt><dd>{p.notes}</dd></div>}
          </dl>
          {p.isAdvance && allocs.length > 0 && (
            <div>
              <p className="text-xs text-ink-soft">Adjusted against</p>
              <ul className="mt-1 space-y-0.5">
                {allocs.map((a) => <li key={a.id}>Invoice {a.invNo}: {money(a.amount)} on {fmtDate(a.date)}</li>)}
              </ul>
            </div>
          )}
          {p.mode === "cheque" && <p className="text-xs text-ink-soft">Subject to realisation of the cheque.</p>}
        </section>

        <footer className="mt-8 flex justify-end">
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
