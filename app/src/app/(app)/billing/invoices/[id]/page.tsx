import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { Mail, Printer } from "lucide-react";
import { getDb } from "@/db";
import { customers, emailOutbox, payments, projects, salesInvoiceLines, salesInvoices, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { PAYMENT_MODES } from "@/lib/constants";
import { daysBetween, fmtDate, fmtDateTime, money, qty, todayIST } from "@/lib/format";
import { OPEN_INVOICE_STATUSES, outstandingOf } from "@/lib/billing";
import { Badge, Card, DL, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { cancelInvoice, recordPayment, sendReminderNow } from "../../actions";

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
  const [lines, pays, mails] = await Promise.all([
    db.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, invoiceId)).orderBy(asc(salesInvoiceLines.id)),
    db.select().from(payments).where(and(eq(payments.direction, "in"), eq(payments.salesInvoiceId, invoiceId))).orderBy(desc(payments.date), desc(payments.id)),
    db.select({ id: emailOutbox.id, to: emailOutbox.to, subject: emailOutbox.subject, status: emailOutbox.status, agent: emailOutbox.agent, createdAt: emailOutbox.createdAt })
      .from(emailOutbox).where(and(eq(emailOutbox.entityType, "sales_invoice"), eq(emailOutbox.entityId, invoiceId))).orderBy(desc(emailOutbox.createdAt)).limit(20),
  ]);

  const outstanding = inv.status === "cancelled" ? 0 : outstandingOf(inv.total, inv.paidAmount);
  const isOpen = (OPEN_INVOICE_STATUSES as readonly string[]).includes(inv.status);
  const od = isOpen ? daysBetween(inv.dueDate, today) : 0;
  const write = canWrite(user.role, "billing");
  const showEmails = canRead(user.role, "emails");

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{inv.number} <StatusBadge status={inv.status} />{od > 0 && <Badge tone="red">{od} days overdue</Badge>}</span>}
        subtitle={<Link href={`/billing/receivables/${c.id}`} className="hover:underline">{c.name}</Link>}
        back={{ href: "/billing/invoices", label: "Invoices" }}
        actions={
          <>
            <LinkButton href={`/billing/invoices/${inv.id}/print`} variant="secondary"><Printer className="h-4 w-4" aria-hidden /> Tax invoice</LinkButton>
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
      {isOpen && !c.email && <p className="mb-4 text-sm text-amber-700 dark:text-amber-300">No e-mail on file for this customer — reminders cannot be sent. Add it in Customers.</p>}

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
            ["Customer GSTIN", c.gstin || "—"],
            ["Customer e-mail", c.email || "—"],
            ["Order", inv.orderId && row.orderNumber ? <Link href={`/orders/${inv.orderId}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.orderNumber}{row.customerPo ? ` (PO ${row.customerPo})` : ""}</Link> : "—"],
            ["Project", row.projectName || "—"],
            ["Notes", inv.notes || "—"],
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
        <Card title={`Payments received (${pays.length})`} bodyClassName={pays.length ? "p-0" : undefined}>
          {pays.length === 0 ? <EmptyState title="No payments yet" /> : (
            <Table className="rounded-none border-0 shadow-none">
              <thead><tr><Th>Date</Th><Th>Mode</Th><Th>Reference</Th><Th className="text-right">Amount</Th></tr></thead>
              <tbody>
                {pays.map((p) => (
                  <tr key={p.id}><Td className="whitespace-nowrap">{fmtDate(p.date)}</Td><Td className="uppercase">{p.mode}</Td><Td>{p.reference || "—"}</Td><Td className="text-right tabular-nums">{money(p.amount)}</Td></tr>
                ))}
              </tbody>
            </Table>
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
