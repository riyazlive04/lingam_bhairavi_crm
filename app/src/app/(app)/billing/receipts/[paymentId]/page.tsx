import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, paymentAllocations, payments, projects, salesInvoices, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, money } from "@/lib/format";
import { amountInWords, getCompany, receiptNumber } from "@/lib/billing";
import { DocNotes, DocSignature, DocTable, DocTotals, DocumentSheet } from "@/components/patterns";

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

  const back = p.salesInvoiceId
    ? { href: `/billing/invoices/${p.salesInvoiceId}`, label: `Back to ${row.invNo ?? "invoice"}` }
    : p.isAdvance ? { href: "/billing/advances", label: "Back to advances" } : { href: "/billing/payments", label: "Back to payments" };
  const facts: [string, string][] = [["Mode", MODE_LABEL[p.mode] ?? p.mode]];
  if (p.reference) facts.push(["Reference", p.reference]);

  return (
    <DocumentSheet
      company={company}
      title={p.isAdvance ? "Advance receipt" : "Payment receipt"}
      numberLabel="Receipt no."
      number={number}
      date={fmtDate(p.date)}
      party={{ label: "Received from", name: c.name, address: c.address, city: c.city, state: c.state, gstin: c.gstin }}
      facts={facts}
      toolbar={{ backHref: back.href, backLabel: back.label }}
    >
      <p className="text-[0.95rem] leading-relaxed">
        Received with thanks from <strong>{c.name}</strong>{c.city ? `, ${c.city}` : ""} the sum of <strong>{money(p.amount)}</strong>.
      </p>

      <DocTable>
        <thead>
          <tr><th>Towards</th><th className="num">Amount</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="whitespace-normal">{towards}{p.notes ? <><br /><span className="text-[var(--doc-soft)]">{p.notes}</span></> : null}</td>
            <td className="num">{money(p.amount)}</td>
          </tr>
        </tbody>
      </DocTable>

      {p.isAdvance && allocs.length > 0 && (
        <DocTable>
          <thead>
            <tr><th>Adjusted against</th><th>Date</th><th className="num">Amount</th></tr>
          </thead>
          <tbody>
            {allocs.map((a) => (
              <tr key={a.id}><td>Invoice {a.invNo}</td><td>{fmtDate(a.date)}</td><td className="num">{money(a.amount)}</td></tr>
            ))}
          </tbody>
        </DocTable>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div />
        <DocTotals total={Number(p.amount)} totalLabel="Amount received" words={amountInWords(Number(p.amount))} />
      </section>

      {p.mode === "cheque" && (
        <DocNotes><p>Subject to realisation of the cheque.</p></DocNotes>
      )}

      <DocSignature company={company.name} />
    </DocumentSheet>
  );
}
