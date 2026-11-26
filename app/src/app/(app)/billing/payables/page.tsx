import Link from "next/link";
import { Download, FileText, X } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { PAYMENT_MODES } from "@/lib/constants";
import { fmtDate, money, moneyShort, todayIST } from "@/lib/format";
import { openPurchaseInvoices, sumAgeing, vendorOutstanding } from "@/lib/billing";
import { EmptyState, Field, Flash, Input, LinkButton, Select, buttonClass } from "@/components/ui";
import { ListPage, Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, type Column } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { recordVendorPayment } from "../actions";
import { AgeingTable } from "../_components/ageing-table";
import { BillingTabs } from "../_components/billing-tabs";

export const metadata = { title: "Vendor payables" };

export default async function PayablesPage({ searchParams }: { searchParams: Promise<{ vendor?: string; pay?: string; ok?: string; err?: string }> }) {
  const user = await requireUser("billing");
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();
  const vendorId = Number(sp.vendor) || undefined;
  const [rows, docs] = await Promise.all([vendorOutstanding(db, today), openPurchaseInvoices(db, { vendorId, today })]);
  const t = sumAgeing(rows);
  const write = canWrite(user.role, "billing");
  const purchasesLink = canRead(user.role, "purchases");
  const vendorName = vendorId ? rows.find((r) => r.partyId === vendorId)?.name : undefined;
  const back = vendorId ? `/billing/payables?vendor=${vendorId}` : "/billing/payables";
  // The bill picked with "Pay" (shown in a full-width form above the bills table).
  const paying = write ? docs.find((d) => d.id === Number(sp.pay)) : undefined;
  const payHref = (id: number) => `/billing/payables?${vendorId ? `vendor=${vendorId}&` : ""}pay=${id}#pay`;

  type Doc = (typeof docs)[number];
  const cols: Column<Doc>[] = [
    { key: "bill", header: "Bill no.", card: "title", nowrap: true,
      cell: (d) => purchasesLink ? <Link href={`/purchases/${d.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{d.number}</Link> : <span className="font-medium">{d.number}</span> },
    { key: "vendor", header: "Vendor", card: "subtitle", className: "max-w-52 truncate", cell: (d) => d.partyName },
    { key: "date", header: "Bill date", nowrap: true, priority: 3, cell: (d) => fmtDate(d.invoiceDate) },
    { key: "due", header: "Due", nowrap: true, cell: (d) => fmtDate(d.dueDate) },
    { key: "state", header: "Status", card: "badge",
      cell: (d) => d.daysOverdue > 0 ? <StatusPill status="overdue" label={`${d.daysOverdue} days overdue`} />
        : d.daysOverdue >= -7 ? <StatusPill status="due_soon" label={d.daysOverdue === 0 ? "Due today" : `Due in ${-d.daysOverdue} days`} />
          : <StatusPill status="open" label="Not due" /> },
    { key: "total", header: "Total", align: "right", nowrap: true, priority: 3, cell: (d) => money(d.total) },
    { key: "paid", header: "Paid", align: "right", nowrap: true, priority: 3, cell: (d) => money(d.paidAmount) },
    { key: "bal", header: "Balance", align: "right", card: "amount", nowrap: true, className: "font-medium", cell: (d) => money(d.outstanding) },
    ...(write ? [{ key: "pay", header: <span className="sr-only">Pay</span>, label: "Pay", card: "actions" as const, align: "right" as const,
      cell: (d: Doc) => <LinkButton href={payHref(d.id)} variant={paying?.id === d.id ? "primary" : "secondary"} size="sm" scroll={false}>Pay bill</LinkButton> }] : []),
  ];

  return (
    <ListPage
      title="Vendor outstanding"
      subtitle="Posted purchase invoices with a balance to pay. Net payable takes off debit notes not yet adjusted."
      secondaryActions={<a href="/billing/export/payables" className={buttonClass("secondary")}><Download className="icon-sm" aria-hidden /> Download Excel</a>}
      tabs={<BillingTabs active="payables" />}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={
        <MetricStrip>
          <Metric label="Net payable" value={moneyShort(t.netDue)} hint={t.debitNotes ? `Bills ${moneyShort(t.outstanding)} less debit notes ${moneyShort(t.debitNotes)}` : undefined} />
          <Metric label="Overdue" value={moneyShort(t.overdue)} tone={t.overdue ? "warn" : "good"} />
          <Metric label="Due in 7 days" value={moneyShort(t.dueNext7)} />
          <Metric label="Over 90 days" value={moneyShort(t.d90p)} tone={t.d90p ? "bad" : "default"} />
        </MetricStrip>
      }
    >
      <div className="space-y-4">
        <AgeingTable kind="vendor" rows={rows} hrefFor={(id) => `/billing/payables?vendor=${id}#bills`}
          emptyTitle="No vendor payables outstanding" emptyText="Posted purchase invoices with a balance show up here." />

        {paying && (
          <SectionCard id="pay" title={`Pay ${paying.number}`} icon={FileText}
            description={`${paying.partyName} · balance ${money(paying.outstanding)} · due ${fmtDate(paying.dueDate)}`}
            actions={<Link href={`${back}#bills`} scroll={false} className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-ink-soft hover:text-ink"><X className="icon-sm" aria-hidden /> Close</Link>}>
            <form action={recordVendorPayment} className="space-y-4">
              <input type="hidden" name="purchaseInvoiceId" value={paying.id} />
              <input type="hidden" name="back" value={back} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Amount (₹)" required><Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={paying.outstanding + 0.5} defaultValue={paying.outstanding} className="text-right" required /></Field>
                <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
                <Field label="Mode" required><Select name="mode" defaultValue="bank">{PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select></Field>
                <Field label="Reference"><Input name="reference" maxLength={80} placeholder="UTR or cheque no." /></Field>
              </div>
              <div className="flex justify-end">
                <SubmitButton variant="success" pendingText="Saving…" className="max-sm:w-full">Record payment</SubmitButton>
              </div>
            </form>
          </SectionCard>
        )}

        <SectionCard id="bills" title={`Unpaid purchase bills${vendorName ? `: ${vendorName}` : ""}`} count={docs.length} flush={docs.length > 0}
          actions={vendorId ? <LinkButton href="/billing/payables" variant="ghost" size="sm">All vendors</LinkButton> : undefined}>
          {docs.length === 0
            ? <EmptyState title="No unpaid bills">{vendorId ? "This vendor has no posted bills with a balance." : "Posted purchase invoices with a balance show up here."}</EmptyState>
            : <ResponsiveTable flush rows={docs} columns={cols} rowKey={(d) => d.id} caption="Unpaid purchase bills"
                rowClassName={(d) => paying?.id === d.id && "bg-brand-50 dark:bg-brand-950/40"} />}
        </SectionCard>
      </div>
    </ListPage>
  );
}
