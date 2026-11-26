import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Mail } from "lucide-react";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, money, todayIST } from "@/lib/format";
import { amountInWords, customerAdvances, customerLedger, getCompany, openSalesInvoices, receiptNumber } from "@/lib/billing";
import { openCreditNotes } from "@/lib/returns";
import { Flash, Input } from "@/components/ui";
import { Callout, ConfirmButton, DocNotes, DocSignature, DocTable, DocTotals, DocumentSheet, ListFilters } from "@/components/patterns";
import { emailStatement } from "../../actions";

/**
 * Customer statement of account on DocumentSheet. The period filter and email action are screen only;
 * the sheet prints as the statement. Statements carry no GST split (ledger amounts are invoice totals),
 * so there is no GstSummaryTable here.
 */
export const metadata = { title: "Customer statement" };
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const link = "text-brand-700 hover:underline dark:text-brand-300 print:text-inherit print:no-underline";

export default async function CustomerLedgerPage({ params, searchParams }: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ from?: string; to?: string; ok?: string; err?: string }>;
}) {
  const user = await requireUser("billing");
  const { customerId: cid } = await params;
  const sp = await searchParams;
  const customerId = Number(cid);
  if (!Number.isInteger(customerId) || customerId <= 0) notFound();
  const db = await getDb();
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!c) notFound();
  const today = todayIST();
  const from = isDate(sp.from) ? sp.from : undefined;
  const to = isDate(sp.to) ? sp.to : undefined;
  const [ledger, open, company, cns, advs] = await Promise.all([
    customerLedger(db, customerId, { from, to }), openSalesInvoices(db, { customerId, today }), getCompany(db),
    openCreditNotes(db, { customerId }), customerAdvances(db, { customerId, openOnly: true }),
  ]);
  const returnsLink = canRead(user.role, "returns");
  const creditTotal = cns.reduce((s, c) => s + c.balance, 0) + advs.reduce((s, a) => s + a.balance, 0);
  const write = canWrite(user.role, "billing");
  const overdue = open.filter((o) => o.daysOverdue > 0).reduce((s, o) => s + o.outstanding, 0);
  const base = `/billing/receivables/${c.id}`;

  const period = from || to ? `${fmtDate(from) } to ${fmtDate(to ?? today)}` : "All time";
  const facts: [ReactNode, ReactNode][] = [
    ["Period", period],
    ["Credit terms", `${c.paymentTermsDays} days`],
    ["Overdue", money(overdue)],
  ];
  if (creditTotal > 0.005) facts.push(["Unused credits", money(creditTotal)]);
  const dueText = (d: number) => (d > 0 ? `${d} days overdue` : d === 0 ? "Due today" : `Due in ${-d} days`);

  return (
    <>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="no-print mx-auto mb-4 max-w-[210mm] space-y-3">
        {!c.email && <Callout tone="warning" title="No email on file">Add an email address on the customer to send this statement.</Callout>}
        {!c.autoReminders && <Callout tone="info">Automatic payment reminders are off for this customer.</Callout>}
        <ListFilters searchName={false} clearHref={base} activeCount={from || to ? 1 : 0}>
          <Input type="date" name="from" defaultValue={from} aria-label="From date" title="From date" />
          <Input type="date" name="to" defaultValue={to} aria-label="To date" title="To date" />
        </ListFilters>
      </div>

      <DocumentSheet
        company={company}
        title="Statement of account"
        numberLabel="As on"
        number={fmtDate(today)}
        party={{ label: "Statement for", name: c.name, address: c.address, city: c.city, state: c.state, gstin: c.gstin,
          extra: [[c.phone, c.email].filter(Boolean).join(" · ")].filter(Boolean) }}
        facts={facts}
        toolbar={{
          backHref: "/billing/receivables",
          backLabel: "Back to receivables",
          printLabel: "Print statement",
          actions: write && (
            <form action={emailStatement}>
              <input type="hidden" name="customerId" value={c.id} />
              <ConfirmButton variant="secondary" disabled={!c.email} pendingText="Sending…" confirmLabel="Yes, email statement"
                confirm={`Email the full statement to ${c.email ?? "the customer"}?`}>
                <Mail className="icon-sm" aria-hidden /> Email statement
              </ConfirmButton>
            </form>
          ),
        }}
      >
        <section className="space-y-2">
          <h2 className="text-[0.8125rem] font-semibold uppercase tracking-wider">Ledger</h2>
          {ledger.entries.length === 0 && !ledger.opening ? (
            <p className="text-[var(--doc-soft)]">No invoices, payments or credit notes for this customer{from || to ? " in this period" : ""}.</p>
          ) : (
            <DocTable>
              <thead>
                <tr><th>Date</th><th>Ref</th><th>Particulars</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr>
              </thead>
              <tbody>
                {from && (
                  <tr><td>{fmtDate(from)}</td><td>-</td><td>Opening balance</td><td className="num" /><td className="num" /><td className="num">{money(ledger.opening)}</td></tr>
                )}
                {ledger.entries.map((e) => (
                  <tr key={`${e.kind}-${e.refId}`}>
                    <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td className="whitespace-nowrap">
                      {e.kind === "invoice" ? <Link href={`/billing/invoices/${e.refId}`} className={link}>{e.ref}</Link>
                        : e.kind === "credit_note" ? (returnsLink ? <Link href={`/returns/${e.refId}`} className={link}>{e.ref}</Link> : e.ref)
                          : <Link href={`/billing/receipts/${e.refId}`} className={link}>{e.ref}</Link>}
                    </td>
                    <td className="whitespace-normal">{e.description}</td>
                    <td className="num">{e.debit ? money(e.debit) : ""}</td>
                    <td className="num">{e.credit ? money(e.credit) : ""}</td>
                    <td className="num">{money(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </DocTable>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div />
          <DocTotals
            rows={[
              ...(from ? [["Opening balance", ledger.opening] as [ReactNode, number]] : []),
              ["Invoiced in period", ledger.debit],
              ["Less received and credited", ledger.credit],
            ]}
            total={ledger.closing}
            totalLabel="Closing balance"
            note={creditTotal > 0.005 ? `Closing balance is after ${money(creditTotal)} of credits not yet used against invoices.` : undefined}
            words={ledger.closing > 0.005 ? amountInWords(ledger.closing) : undefined}
          />
        </section>

        {open.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[0.8125rem] font-semibold uppercase tracking-wider">Open invoices ({open.length})</h2>
            <DocTable>
              <thead>
                <tr><th>Invoice</th><th>Date</th><th>Due</th><th className="num">Total</th><th className="num">Outstanding</th><th>Status</th><th className="num">Reminders</th></tr>
              </thead>
              <tbody>
                {open.map((o) => (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap"><Link href={`/billing/invoices/${o.id}`} className={link}>{o.number}</Link></td>
                    <td className="whitespace-nowrap">{fmtDate(o.invoiceDate)}</td>
                    <td className="whitespace-nowrap">{fmtDate(o.dueDate)}</td>
                    <td className="num">{money(o.total)}</td>
                    <td className="num font-semibold">{money(o.outstanding)}</td>
                    <td className="whitespace-nowrap">{dueText(o.daysOverdue)}</td>
                    <td className="num">{o.reminderCount || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </DocTable>
          </section>
        )}

        {(cns.length > 0 || advs.length > 0) && (
          <section className="space-y-2">
            <h2 className="text-[0.8125rem] font-semibold uppercase tracking-wider">Credits not yet used ({cns.length + advs.length})</h2>
            <DocTable>
              <thead>
                <tr><th>Type</th><th>Ref</th><th>Date</th><th className="num">Amount</th><th className="num">Used</th><th className="num">Balance</th></tr>
              </thead>
              <tbody>
                {cns.map((n) => (
                  <tr key={`cn-${n.id}`}>
                    <td>Credit note</td>
                    <td className="whitespace-nowrap">{returnsLink ? <Link href={`/returns/${n.id}`} className={link}>{n.number}</Link> : n.number}</td>
                    <td className="whitespace-nowrap">{fmtDate(n.date)}</td>
                    <td className="num">{money(n.total)}</td><td className="num">{money(n.adjustedAmount)}</td>
                    <td className="num font-semibold">{money(n.balance)}</td>
                  </tr>
                ))}
                {advs.map((a) => (
                  <tr key={`adv-${a.id}`}>
                    <td>Advance</td>
                    <td className="whitespace-nowrap"><Link href={`/billing/receipts/${a.id}`} className={link}>{a.reference || receiptNumber(a)}</Link>{a.orderNumber && <div className="text-[var(--doc-soft)]">{a.orderNumber}</div>}</td>
                    <td className="whitespace-nowrap">{fmtDate(a.date)}</td>
                    <td className="num">{money(a.amount)}</td><td className="num">{money(a.allocatedAmount)}</td>
                    <td className="num font-semibold">{money(a.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </DocTable>
          </section>
        )}

        <DocNotes>
          <p>Credits not yet used will be adjusted against open invoices. E. &amp; O.E.</p>
          {company.bank && <p className="whitespace-pre-line"><strong>Bank details:</strong> {company.bank}</p>}
        </DocNotes>

        <DocSignature company={company.name} />
      </DocumentSheet>
    </>
  );
}
