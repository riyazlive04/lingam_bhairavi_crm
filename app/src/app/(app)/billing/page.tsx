import { CalendarClock, Download, HandCoins, Plus, Truck } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { addDays, fmtDate, money, moneyShort, todayIST } from "@/lib/format";
import { customerOutstanding, openPurchaseInvoices, paymentTotals, sumAgeing, vendorOutstanding } from "@/lib/billing";
import { CardLink, Flash, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, type Column } from "@/components/patterns";
import { AgeingTable } from "./_components/ageing-table";
import { BillingTabs } from "./_components/billing-tabs";

export const metadata = { title: "Billing and outstanding" };

export default async function BillingOverview({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("billing");
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();
  const monthStart = today.slice(0, 8) + "01";

  const [recv, pay, openPI, month] = await Promise.all([
    customerOutstanding(db, today),
    vendorOutstanding(db, today),
    openPurchaseInvoices(db, { today }),
    paymentTotals(db, monthStart, today),
  ]);
  const rt = sumAgeing(recv), pt = sumAgeing(pay);
  const dueSoon = openPI.filter((p) => p.daysOverdue <= 0 && p.dueDate <= addDays(today, 7));
  const overduePI = openPI.filter((p) => p.daysOverdue > 0).length;
  const write = canWrite(user.role, "billing");

  type Due = (typeof dueSoon)[number];
  const dueCols: Column<Due>[] = [
    { key: "vendor", header: "Vendor / bill", card: "title", className: "max-w-48",
      cell: (p) => <><div className="truncate">{p.partyName}</div><div className="text-caption font-normal text-ink-soft">{p.number}</div></> },
    { key: "due", header: "Due", card: "badge", nowrap: true,
      cell: (p) => p.daysOverdue === 0 ? <StatusPill status="due_soon" label="Due today" /> : fmtDate(p.dueDate) },
    { key: "bal", header: "Balance", align: "right", card: "amount", nowrap: true, cell: (p) => money(p.outstanding) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Billing and outstanding"
        subtitle="Customer receivables, vendor payables and collections."
        actions={<>
          <a href="/billing/export/receivables" className={buttonClass("secondary")}><Download className="icon-sm" aria-hidden /> Download receivables Excel</a>
          {write && <LinkButton href="/billing/advances" variant="secondary"><HandCoins className="icon-sm" aria-hidden /> Record advance</LinkButton>}
          {write && <LinkButton href="/billing/invoices/new"><Plus className="icon-sm" aria-hidden /> New invoice</LinkButton>}
        </>}
      />
      <BillingTabs active="overview" />
      <Flash ok={sp.ok} err={sp.err} />

      <SectionCard title="Receivables from customers" icon={HandCoins} flush
        actions={recv.length > 0 && <CardLink href="/billing/receivables">{recv.length > 10 ? `View all ${recv.length} customers` : "View all"}</CardLink>}>
        <div className="border-b border-line p-4 sm:p-5">
          <MetricStrip>
            <Metric label="Net receivable" value={moneyShort(rt.netDue)} href="/billing/receivables"
              hint={rt.creditNotes + rt.advances > 0 ? `Invoices ${moneyShort(rt.outstanding)} less ${moneyShort(rt.creditNotes + rt.advances)} credits and advances` : `${recv.length} customer${recv.length === 1 ? "" : "s"}`} />
            <Metric label="Overdue" value={moneyShort(rt.overdue)} tone={rt.overdue > 0 ? "bad" : "good"} hint="Past the due date" href="/billing/invoices?overdue=1" />
            <Metric label="Over 90 days" value={moneyShort(rt.d90p)} tone={rt.d90p > 0 ? "bad" : "default"} hint="Follow up by phone" />
            <Metric label="Collected this month" value={moneyShort(month.in.total)} tone="good" hint={`${month.in.count} receipt${month.in.count === 1 ? "" : "s"} since ${fmtDate(monthStart)}`} href="/billing/payments?direction=in" />
          </MetricStrip>
        </div>
        <AgeingTable flush kind="customer" rows={recv} limit={10} hrefFor={(id) => `/billing/receivables/${id}`}
          emptyTitle="Nothing outstanding" emptyText="All customer invoices are paid." />
      </SectionCard>

      <SectionCard title="Payables to vendors" icon={Truck} flush
        actions={<>
          <a href="/billing/export/payables" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">Download Excel</a>
          {pay.length > 0 && <CardLink href="/billing/payables">View all</CardLink>}
        </>}>
        <div className="border-b border-line p-4 sm:p-5">
          <MetricStrip>
            <Metric label="Net payable" value={moneyShort(pt.netDue)} href="/billing/payables"
              hint={pt.debitNotes > 0 ? `Bills ${moneyShort(pt.outstanding)} less ${moneyShort(pt.debitNotes)} debit notes` : `${pay.length} vendor${pay.length === 1 ? "" : "s"}`} />
            <Metric label="Overdue" value={moneyShort(pt.overdue)} tone={pt.overdue > 0 ? "warn" : "good"} hint={`${overduePI} invoice${overduePI === 1 ? "" : "s"}`} />
            <Metric label="Due in the next 7 days" value={moneyShort(dueSoon.reduce((s, p) => s + p.outstanding, 0))} hint={`${dueSoon.length} invoice${dueSoon.length === 1 ? "" : "s"}`} />
            <Metric label="Paid this month" value={moneyShort(month.out.total)} hint={`${month.out.count} payment${month.out.count === 1 ? "" : "s"}`} href="/billing/payments?direction=out" />
          </MetricStrip>
        </div>
        <AgeingTable flush kind="vendor" rows={pay} limit={10} hrefFor={(id) => `/billing/payables?vendor=${id}`}
          emptyTitle="No vendor payables outstanding" emptyText="Posted purchase invoices with a balance show up here." />
      </SectionCard>

      <SectionCard title="Vendor bills due in the next 7 days" icon={CalendarClock} count={dueSoon.length} flush={dueSoon.length > 0}
        empty={dueSoon.length === 0 && "Nothing due this week."}>
        <ResponsiveTable flush rows={dueSoon} columns={dueCols} rowKey={(p) => p.id} caption="Vendor bills due in the next 7 days" />
      </SectionCard>

      <p className="text-caption text-ink-faint">Ageing buckets are by days past the due date. Net receivable is invoices due less unadjusted credit notes and unused advances. Net payable is bills due less unadjusted debit notes. Payables include posted purchase invoices only, and the due date defaults to the invoice date plus the vendor&apos;s credit days. Amounts in ₹ (INR).</p>
    </div>
  );
}
