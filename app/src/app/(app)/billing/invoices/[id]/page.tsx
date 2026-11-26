import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Ban, FileText, Mail, Printer, Undo2, Wallet } from "lucide-react";
import { getDb } from "@/db";
import { auditLog, customers, emailOutbox, paymentAllocations, payments, projects, salesInvoiceLines, salesInvoices, salesOrders, salesReturns } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { PAYMENT_MODES } from "@/lib/constants";
import { daysBetween, fmtDate, fmtDateTime, money, qty, round2, todayIST } from "@/lib/format";
import { OPEN_INVOICE_STATUSES, customerAdvances, outstandingOf, receiptNumber } from "@/lib/billing";
import { reasonLabel } from "@/lib/returns";
import { Field, Flash, Input, LinkButton, Select, cx } from "@/components/ui";
import {
  Callout, ConfirmButton, DetailPage, KeyValueGrid, MetaChip, ResponsiveTable, SectionCard, StatusPill, SummaryRows, Tabs, activeTab, tabHref,
  type Column, type TabItem,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { applyAdvance, cancelInvoice, recordPayment, sendReminderNow } from "../../actions";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; tab?: string }> }) {
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

  const base = `/billing/invoices/${inv.id}`;
  const tabParams = { tab: sp.tab };
  const tab = activeTab(sp.tab, ["lines", "payments", "emails"] as const);
  const tabItems: TabItem[] = [
    { id: "lines", label: "Lines", count: lines.length },
    { id: "payments", label: "Payments and credits", count: receipts.length + cns.length },
    { id: "emails", label: "E-mails", count: mails.length },
  ];
  const canPay = write && isOpen;
  const canReturn = returnsWrite && inv.status !== "cancelled" && inv.status !== "draft";
  const canCancel = write && inv.status !== "cancelled" && Number(inv.paidAmount) === 0;

  type Line = (typeof lines)[number];
  const taxOf = (l: Line) => (Number(l.amount) * Number(l.gstRate)) / 100;
  const lineCols: Column<Line>[] = [
    { key: "n", header: "#", card: "hidden", className: "text-ink-soft", cell: (_l, i) => i + 1 },
    { key: "desc", header: "Description", card: "title", className: "max-w-80 whitespace-normal", cell: (l) => l.description },
    { key: "qty", header: "Qty", align: "right", nowrap: true, cell: (l) => qty(l.qty) },
    { key: "rate", header: "Rate", align: "right", nowrap: true, cell: (l) => money(l.rate) },
    { key: "taxable", header: "Taxable", align: "right", nowrap: true, priority: 3, cell: (l) => money(l.amount) },
    { key: "gst", header: "GST", align: "right", nowrap: true, priority: 3,
      cell: (l) => <>{money(taxOf(l))} <span className="text-caption text-ink-soft">@{l.gstRate}%</span></> },
    { key: "total", header: "Total", align: "right", card: "amount", nowrap: true, cell: (l) => money(Number(l.amount) + taxOf(l)) },
  ];
  const recCols: Column<Receipt>[] = [
    { key: "type", header: "Type", card: "title", cell: (p) => p.label },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (p) => fmtDate(p.date) },
    { key: "ref", header: "Receipt or reference", cell: (p) => p.ref },
    { key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true, cell: (p) => money(p.amount) },
  ];
  type Cn = (typeof cns)[number];
  const cnCols: Column<Cn>[] = [
    { key: "no", header: "Credit note", card: "title", nowrap: true,
      cell: (r) => returnsRead ? <Link href={`/returns/${r.id}`} className={cx(lnk, "rt-stretch font-medium")}>{r.status === "draft" ? "Draft" : r.number}</Link> : r.number },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (r) => fmtDate(r.date) },
    { key: "reason", header: "Reason", cell: (r) => reasonLabel(r.reason) },
    { key: "status", header: "Status", card: "badge", cell: (r) => <StatusPill status={r.status} /> },
    { key: "total", header: "Total", align: "right", card: "amount", nowrap: true, cell: (r) => money(r.total) },
  ];
  type MailRow = (typeof mails)[number];
  const mailCols: Column<MailRow>[] = [
    { key: "subject", header: "Subject", card: "title", className: "max-w-80 whitespace-normal",
      cell: (m) => showEmails ? <Link href={`/emails/${m.id}`} className={cx(lnk, "rt-stretch font-medium")}>{m.subject}</Link> : <span className="font-medium">{m.subject}</span> },
    { key: "to", header: "To", card: "subtitle", cell: (m) => m.to },
    { key: "at", header: "Sent", nowrap: true, cell: (m) => fmtDateTime(m.createdAt) },
    { key: "by", header: "Sent by", priority: 3, cell: (m) => m.agent ?? "Manual" },
    { key: "status", header: "Status", card: "badge", cell: (m) => <StatusPill status={m.status} /> },
  ];

  const printBtn = (variant: "primary" | "secondary") => (
    <LinkButton href={`${base}/print`} variant={variant}><Printer className="icon-sm" aria-hidden /> Print tax invoice</LinkButton>
  );

  return (
    <DetailPage
      back={{ href: "/billing/invoices", label: "Invoices" }}
      eyebrow="Tax invoice"
      title={inv.number}
      status={<>
        <StatusPill status={inv.status} />
        {od > 0 && <StatusPill status="overdue" label={`${od} days overdue`} />}
      </>}
      meta={<>
        <MetaChip label="Customer" href={`/billing/receivables/${c.id}`}>{c.name}</MetaChip>
        <MetaChip label="Date">{fmtDate(inv.invoiceDate)}</MetaChip>
        <MetaChip label="Due">{fmtDate(inv.dueDate)}</MetaChip>
        {inv.orderId && row.orderNumber && <MetaChip label="Order" href={`/orders/${inv.orderId}`}>{row.orderNumber}</MetaChip>}
        <MetaChip label="Total">{money(inv.total)}</MetaChip>
      </>}
      primaryAction={canPay
        ? <LinkButton href={`${tabHref(base, tabParams, "payments", "lines")}#record-payment`}><Wallet className="icon-sm" aria-hidden /> Record payment</LinkButton>
        : printBtn("primary")}
      secondaryActions={(canPay || canReturn) ? (
        <>
          {canPay && printBtn("secondary")}
          {canReturn && <LinkButton href={`/returns/new?invoiceId=${inv.id}`} variant="secondary"><Undo2 className="icon-sm" aria-hidden /> Record return</LinkButton>}
          {canPay && (
            <form action={sendReminderNow}>
              <input type="hidden" name="invoiceId" value={inv.id} />
              <SubmitButton variant="secondary" pendingText="Sending…" disabled={!c.email} title={c.email ? `E-mail ${c.email}` : "Customer has no e-mail address"}
                confirm={`Send a payment reminder to ${c.email ?? "the customer"} now?`}>
                <Mail className="icon-sm" aria-hidden /> Send reminder
              </SubmitButton>
            </form>
          )}
        </>
      ) : undefined}
      moreActions={canCancel ? (
        <form action={cancelInvoice}>
          <input type="hidden" name="invoiceId" value={inv.id} />
          <ConfirmButton variant="ghost" className="text-danger" confirmVariant="danger" stacked pendingText="Cancelling…" confirmLabel="Yes, cancel invoice"
            confirm={`Cancel invoice ${inv.number}? Order invoiced quantities and price history will be reversed.`}>
            <Ban className="icon-sm" aria-hidden /> Cancel invoice
          </ConfirmButton>
        </form>
      ) : undefined}
      notices={<>
        <Flash ok={sp.ok} err={sp.err} />
        {od > 0 && (
          <Callout tone="danger" title={`Payment is ${od} days overdue`}>
            {money(outstanding)} was due on {fmtDate(inv.dueDate)}. Record the payment when it arrives{c.email ? ", or send a reminder" : ""}.
          </Callout>
        )}
        {isOpen && !c.email && (
          <Callout tone="warning" title="No e-mail on file">Reminders cannot be sent to this customer. Add an e-mail address in Customers.</Callout>
        )}
      </>}
      tabs={<Tabs label="Invoice sections" basePath={base} params={tabParams} active={tab} items={tabItems} />}
      aside={<>
        <SectionCard title="Summary" icon={FileText}>
          <SummaryRows rows={[
            ["Total", money(inv.total)],
            ["Received", <span key="r" className="text-success">{money(inv.paidAmount)}</span>],
            ["Outstanding", <span key="o" className={cx(od > 0 && "text-danger")}>{money(outstanding)}</span>],
            ["Reminders sent", inv.reminderCount],
          ]} />
          <p className="mt-3 text-caption text-ink-soft">{inv.lastReminderAt ? `Last reminder ${fmtDateTime(inv.lastReminderAt)}` : "No reminders sent yet."}</p>
        </SectionCard>
        <SectionCard title="Invoice details">
          <KeyValueGrid columns={1} items={[
            { label: "Invoice date", value: fmtDate(inv.invoiceDate) },
            { label: "Due date", value: fmtDate(inv.dueDate) },
            { label: "Customer GSTIN", value: c.gstin },
            { label: "Customer e-mail", value: c.email },
            { label: "Order", value: inv.orderId && row.orderNumber ? <Link href={`/orders/${inv.orderId}`} className={lnk}>{row.orderNumber}{row.customerPo ? ` (PO ${row.customerPo})` : ""}</Link> : null },
            { label: "Project", value: row.projectName },
            { label: "Notes", value: inv.notes },
          ]} />
        </SectionCard>
      </>}
    >
      {tab === "lines" && (
        <SectionCard title="Invoice lines" count={lines.length} flush={lines.length > 0} empty={lines.length === 0 && "This invoice has no lines."}>
          <ResponsiveTable flush rows={lines} columns={lineCols} rowKey={(l) => l.id} caption="Invoice lines"
            footerRows={[{
              label: "Totals", labelAlign: "right", className: "", labelClassName: "font-medium",
              cells: { taxable: money(inv.subtotal), gst: money(inv.taxAmount), total: { value: money(inv.total), className: "font-semibold" } },
            }]} />
        </SectionCard>
      )}

      {tab === "payments" && (
        <>
          {canPay ? (
            <SectionCard id="record-payment" title="Record payment" icon={Wallet} description={`${money(outstanding)} is still to be received.`}>
              <form action={recordPayment} className="space-y-4">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Field label="Amount (₹)" required><Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={outstanding + 0.5} defaultValue={outstanding} required className="text-right" /></Field>
                  <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
                  <Field label="Mode" required>
                    <Select name="mode" defaultValue="bank">{PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select>
                  </Field>
                  <Field label="Reference" hint="UTR or cheque no."><Input name="reference" maxLength={80} /></Field>
                  <Field label="Notes" className="xl:col-span-2"><Input name="notes" maxLength={1000} /></Field>
                </div>
                <div className="flex justify-end">
                  <SubmitButton variant="success" pendingText="Recording…" className="max-sm:w-full">Record payment</SubmitButton>
                </div>
              </form>
            </SectionCard>
          ) : (
            <Callout tone={inv.status === "paid" ? "success" : "info"}>
              {inv.status === "paid" ? "This invoice is fully paid." : inv.status === "cancelled" ? "This invoice is cancelled." : "You can view payments but not record them."}
            </Callout>
          )}

          {advances.length > 0 && bestAdvance && (
            <SectionCard title="Apply advance" icon={Wallet} description={`${c.name} has ${money(round2(advances.reduce((s, a) => s + a.balance, 0)))} in advances not yet used.`}>
              <form action={applyAdvance} className="grid gap-4 sm:grid-cols-3 sm:items-end">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <Field label="Advance" required>
                  <Select name="paymentId" required defaultValue={String(bestAdvance.id)}>
                    {advances.map((a) => <option key={a.id} value={a.id}>{receiptNumber(a)} · {fmtDate(a.date)}{a.orderNumber ? ` · ${a.orderNumber}` : ""} · balance {money(a.balance)}</option>)}
                  </Select>
                </Field>
                <Field label="Amount (₹)" required hint="Up to the advance balance or this invoice's outstanding, whichever is lower">
                  <Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={outstanding} defaultValue={round2(Math.min(bestAdvance.balance, outstanding))} required className="text-right" />
                </Field>
                <div><SubmitButton variant="success" pendingText="Applying…" className="max-sm:w-full">Apply advance</SubmitButton></div>
              </form>
            </SectionCard>
          )}

          <SectionCard title="Payments and credits" count={receipts.length} flush={receipts.length > 0}
            empty={receipts.length === 0 && (canPay ? "No payments yet. Record one above when the customer pays." : "No payments yet.")}>
            <ResponsiveTable flush rows={receipts} columns={recCols} rowKey={(p) => p.key} caption="Payments and credits" />
          </SectionCard>

          {cns.length > 0 && (
            <SectionCard title="Credit notes against this invoice" count={cns.length} icon={Undo2} flush>
              <ResponsiveTable flush rows={cns} columns={cnCols} rowKey={(r) => r.id} caption="Credit notes" />
            </SectionCard>
          )}
        </>
      )}

      {tab === "emails" && (
        <SectionCard title="E-mails" count={mails.length} icon={Mail} flush={mails.length > 0}
          empty={mails.length === 0 && "No reminders sent yet. Reminders sent by hand or by the dunning agent appear here."}>
          <ResponsiveTable flush rows={mails} columns={mailCols} rowKey={(m) => m.id} caption="E-mails" />
        </SectionCard>
      )}
    </DetailPage>
  );
}
