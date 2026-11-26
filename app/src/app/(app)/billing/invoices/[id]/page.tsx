import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Mail, Printer, Undo2 } from "lucide-react";
import { getDb } from "@/db";
import { auditLog, customers, emailOutbox, paymentAllocations, payments, projects, salesInvoiceLines, salesInvoices, salesOrders, salesReturns } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { PAYMENT_MODES } from "@/lib/constants";
import { daysBetween, fmtDate, fmtDateTime, money, qty, round2, todayIST } from "@/lib/format";
import { OPEN_INVOICE_STATUSES, customerAdvances, outstandingOf, receiptNumber } from "@/lib/billing";
import { reasonLabel } from "@/lib/returns";
import { Badge, Card, DL, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { applyAdvance, cancelInvoice, recordPayment, sendReminderNow } from "../../actions";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("billing");
  const { id } = await params;
  const sp = await searchParams;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) notFound();
  const db = await getDb();
  const today = todayIST();

  const [row] = await db.select({ inv: salesInvoices, c: customers, orderNumber: salesOrders.number, customerPo: salesOrders.customerPoNumber, projectName: projects.name })
    .from(salesInvoices)
    .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
    .leftJoin(salesOrders, eq(salesOrders.id, salesInvoices.orderId))
    .leftJoin(projects, eq(projects.id, salesInvoices.projectId))
    .where(eq(salesInvoices.id, invoiceId));
  if (!row) notFound();
  const { inv, c } = row;
  const [lines, pays, mails, allocs, cnAdj, cns] = await Promise.all([
    db.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, invoiceId)).orderBy(asc(salesInvoiceLines.id)),
    db.select().from(payments).where(and(eq(payments.direction, "in"), eq(payments.salesInvoiceId, invoiceId))).orderBy(desc(payments.date), desc(payments.id)),
    db.select({ id: emailOutbox.id, to: emailOutbox.to, subject: emailOutbox.subject, status: emailOutbox.status, agent: emailOutbox.agent, createdAt: emailOutbox.createdAt })
      .from(emailOutbox).where(and(eq(emailOutbox.entityType, "sales_invoice"), eq(emailOutbox.entityId, invoiceId))).orderBy(desc(emailOutbox.createdAt)).limit(20),
    db.select({ id: paymentAllocations.id, amount: paymentAllocations.amount, date: paymentAllocations.date, paymentId: paymentAllocations.paymentId, payDate: payments.date })
      .from(paymentAllocations).innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(eq(paymentAllocations.salesInvoiceId, invoiceId)).orderBy(desc(paymentAllocations.date), desc(paymentAllocations.id)),
    db.select({ at: auditLog.at, details: auditLog.details }).from(auditLog)
      .where(and(eq(auditLog.entityType, "sales_invoice"), eq(auditLog.entityId, invoiceId), eq(auditLog.action, "credit_adjust"))).orderBy(desc(auditLog.at)),
    db.select({ id: salesReturns.id, number: salesReturns.number, date: salesReturns.date, total: salesReturns.total, status: salesReturns.status, reason: salesReturns.reason })
      .from(salesReturns).where(and(eq(salesReturns.salesInvoiceId, invoiceId), sql`${salesReturns.status} <> 'cancelled'`)).orderBy(desc(salesReturns.date)),
  ]);

  const outstanding = inv.status === "cancelled" ? 0 : outstandingOf(inv.total, inv.paidAmount);
  const isOpen = (OPEN_INVOICE_STATUSES as readonly string[]).includes(inv.status);
  const od = isOpen ? daysBetween(inv.dueDate, today) : 0;
  const write = canWrite(user.role, "billing");
  const showEmails = canRead(user.role, "emails");
  const returnsRead = canRead(user.role, "returns");
  const returnsWrite = canWrite(user.role, "returns");
  const advances = write && isOpen ? await customerAdvances(db, { customerId: c.id, openOnly: true }) : [];
  const bestAdvance = advances.find((a) => a.orderId && a.orderId === inv.orderId) ?? advances.find((a) => a.projectId && a.projectId === inv.projectId) ?? advances[0];
  const lnk = "text-brand-700 hover:underline dark:text-brand-300";
  type Receipt = { key: string; date: string; label: string; ref: ReactNode; amount: number };
  const receipts: Receipt[] = [
    ...pays.map((p): Receipt => ({
      key: `p${p.id}`, date: p.date, label: p.mode.toUpperCase(), amount: Number(p.amount),
      ref: <Link href={`/billing/receipts/${p.id}`} className={lnk}>{p.reference || receiptNumber(p)}</Link>,
    })),
    ...allocs.map((a): Receipt => ({
      key: `a${a.id}`, date: a.date, label: "Advance applied", amount: Number(a.amount),
      ref: <Link href={`/billing/receipts/${a.paymentId}`} className={lnk}>{receiptNumber({ id: a.paymentId, date: a.payDate })}</Link>,
    })),
    ...cnAdj.map((h, i): Receipt => {
      const d = (h.details ?? {}) as { returnId?: number; number?: string; amount?: number };
      return {
        key: `c${i}`, date: new Date(h.at).toISOString().slice(0, 10), label: "Credit note", amount: Number(d.amount ?? 0),
        ref: d.returnId && returnsRead ? <Link href={`/returns/${d.returnId}`} className={lnk}>{d.number ?? "Credit note"}</Link> : d.number ?? "-",
      };
    }),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{inv.number} <StatusBadge status={inv.status} />{od > 0 && <Badge tone="red">{od} days overdue</Badge>}</span>}
        subtitle={<Link href={`/billing/receivables/${c.id}`} className="hover:underline">{c.name}</Link>}
        back={{ href: "/billing/invoices", label: "Invoices" }}
        actions={
          <>
            <LinkButton href={`/billing/invoices/${inv.id}/print`} variant="secondary"><Printer className="h-4 w-4" aria-hidden /> Tax invoice</LinkButton>
            {returnsWrite && inv.status !== "cancelled" && inv.status !== "draft" && (
              <LinkButton href={`/returns/new?invoiceId=${inv.id}`} variant="secondary"><Undo2 className="h-4 w-4" aria-hidden /> Record return</LinkButton>
            )}
            {write && isOpen && (
              <form action={sendReminderNow}>
                <input type="hidden" name="invoiceId" value={inv.id} />
                <SubmitButton variant="secondary" pendingText="Sending…" disabled={!c.email} title={c.email ? `E-mail ${c.email}` : "Customer has no e-mail address"}
                  confirm={`Send a payment reminder to ${c.email ?? "the customer"} now?`}>
                  <Mail className="h-4 w-4" aria-hidden /> Send reminder
                </SubmitButton>
              </form>
            )}
            {write && inv.status !== "cancelled" && Number(inv.paidAmount) === 0 && (
              <form action={cancelInvoice}>
                <input type="hidden" name="invoiceId" value={inv.id} />
                <SubmitButton variant="danger" pendingText="Cancelling…" confirm={`Cancel invoice ${inv.number}? Order invoiced quantities and price history will be reversed.`}>Cancel</SubmitButton>
              </form>
            )}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      {isOpen && !c.email && <p className="mb-4 text-sm text-amber-700 dark:text-amber-300">There is no e-mail on file for this customer, so reminders cannot be sent. Add one in Customers.</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Total</div><div className="mt-1 text-xl font-semibold tabular-nums">{money(inv.total)}</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Received</div><div className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">{money(inv.paidAmount)}</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Outstanding</div><div className={`mt-1 text-xl font-semibold tabular-nums ${od > 0 ? "text-red-600" : "text-ink"}`}>{money(outstanding)}</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Reminders sent</div><div className="mt-1 text-xl font-semibold tabular-nums">{inv.reminderCount}</div>
          <div className="text-xs text-ink-soft">{inv.lastReminderAt ? `Last ${fmtDateTime(inv.lastReminderAt)}` : "None yet"}</div></div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <DL items={[
            ["Invoice date", fmtDate(inv.invoiceDate)],
            ["Due date", fmtDate(inv.dueDate)],
            ["Customer GSTIN", c.gstin || "-"],
            ["Customer e-mail", c.email || "-"],
            ["Order", inv.orderId && row.orderNumber ? <Link href={`/orders/${inv.orderId}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.orderNumber}{row.customerPo ? ` (PO ${row.customerPo})` : ""}</Link> : "-"],
            ["Project", row.projectName || "-"],
            ["Notes", inv.notes || "-"],
          ]} />
        </Card>
        {write && isOpen ? (
          <Card title="Record payment">
            <form action={recordPayment} className="grid gap-3">
              <input type="hidden" name="invoiceId" value={inv.id} />
              <Field label="Amount (₹)" required><Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={outstanding + 0.5} defaultValue={outstanding} required /></Field>
              <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
              <Field label="Mode" required>
                <Select name="mode" defaultValue="bank">{PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select>
              </Field>
              <Field label="Reference" hint="UTR / cheque no."><Input name="reference" maxLength={80} /></Field>
              <Field label="Notes"><Input name="notes" maxLength={1000} /></Field>
              <SubmitButton variant="success" pendingText="Recording…">Record payment</SubmitButton>
            </form>
          </Card>
        ) : (
          <Card title="Payment">
            <p className="text-sm text-ink-soft">{inv.status === "paid" ? "This invoice is fully paid." : inv.status === "cancelled" ? "This invoice is cancelled." : "Read-only access."}</p>
          </Card>
        )}
      </div>

      {advances.length > 0 && bestAdvance && (
        <Card title="Apply advance" subtitle={`${c.name} has ${money(round2(advances.reduce((s, a) => s + a.balance, 0)))} in advances not yet used`} className="mb-4">
          <form action={applyAdvance} className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <Field label="Advance" required>
              <Select name="paymentId" required defaultValue={String(bestAdvance.id)}>
                {advances.map((a) => <option key={a.id} value={a.id}>{receiptNumber(a)} · {fmtDate(a.date)}{a.orderNumber ? ` · ${a.orderNumber}` : ""} · balance {money(a.balance)}</option>)}
              </Select>
            </Field>
            <Field label="Amount (₹)" required hint="Up to the advance balance or this invoice's outstanding, whichever is lower">
              <Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={outstanding} defaultValue={round2(Math.min(bestAdvance.balance, outstanding))} required />
            </Field>
            <div><SubmitButton variant="success" pendingText="Applying…">Apply advance</SubmitButton></div>
          </form>
        </Card>
      )}

      <Card title="Lines" className="mb-4" bodyClassName="p-0">
        <Table className="rounded-none border-0 shadow-none">
          <thead><tr><Th>#</Th><Th>Description</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th><Th className="text-right">Taxable</Th><Th className="text-right">GST</Th><Th className="text-right">Total</Th></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const tax = (Number(l.amount) * Number(l.gstRate)) / 100;
              return (
                <tr key={l.id}>
                  <Td className="text-ink-soft">{i + 1}</Td>
                  <Td className="max-w-80 whitespace-normal">{l.description}</Td>
                  <Td className="text-right tabular-nums">{qty(l.qty)}</Td>
                  <Td className="text-right tabular-nums">{money(l.rate)}</Td>
                  <Td className="text-right tabular-nums">{money(l.amount)}</Td>
                  <Td className="text-right tabular-nums">{money(tax)} <span className="text-xs text-ink-soft">@{l.gstRate}%</span></Td>
                  <Td className="text-right tabular-nums">{money(Number(l.amount) + tax)}</Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><Td colSpan={4} className="text-right font-medium">Totals</Td><Td className="text-right tabular-nums">{money(inv.subtotal)}</Td><Td className="text-right tabular-nums">{money(inv.taxAmount)}</Td><Td className="text-right font-semibold tabular-nums">{money(inv.total)}</Td></tr>
          </tfoot>
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Payments and credits (${receipts.length})`} bodyClassName={receipts.length || cns.length ? "p-0" : undefined}>
          {receipts.length === 0 ? <div className={cns.length ? "p-4" : undefined}><EmptyState title="No payments yet" /></div> : (
            <Table className="rounded-none border-0 shadow-none">
              <thead><tr><Th>Date</Th><Th>Type</Th><Th>Receipt / ref</Th><Th className="text-right">Amount</Th></tr></thead>
              <tbody>
                {receipts.map((p) => (
                  <tr key={p.key}><Td className="whitespace-nowrap">{fmtDate(p.date)}</Td><Td>{p.label}</Td><Td>{p.ref}</Td><Td className="text-right tabular-nums">{money(p.amount)}</Td></tr>
                ))}
              </tbody>
            </Table>
          )}
          {cns.length > 0 && (
            <div className="border-t border-line px-4 py-3 text-sm">
              <p className="mb-1 text-xs font-medium text-ink-soft">Credit notes against this invoice</p>
              <ul className="space-y-0.5">
                {cns.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span>{returnsRead ? <Link href={`/returns/${r.id}`} className={lnk}>{r.status === "draft" ? "Draft" : r.number}</Link> : r.number} · {fmtDate(r.date)} · {reasonLabel(r.reason)}</span>
                    <span className="tabular-nums">{money(r.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card title={`E-mails (${mails.length})`} bodyClassName={mails.length ? "p-0" : undefined}>
          {mails.length === 0 ? <EmptyState title="No reminders sent">Reminders sent manually or by the dunning agent appear here.</EmptyState> : (
            <ul className="divide-y divide-line">
              {mails.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-2 px-4 py-2 text-sm">
                  <div className="min-w-0">
                    {showEmails ? <Link href={`/emails/${m.id}`} className="block truncate font-medium text-brand-700 hover:underline dark:text-brand-300">{m.subject}</Link> : <span className="block truncate font-medium">{m.subject}</span>}
                    <span className="text-xs text-ink-soft">{m.to} · {fmtDateTime(m.createdAt)} · {m.agent ?? "manual"}</span>
                  </div>
                  <StatusBadge status={m.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
