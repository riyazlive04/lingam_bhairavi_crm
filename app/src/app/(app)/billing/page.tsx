import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { addDays, fmtDate, money, moneyShort, todayIST } from "@/lib/format";
import { customerOutstanding, openPurchaseInvoices, paymentTotals, sumAgeing, vendorOutstanding } from "@/lib/billing";
import { Badge, Card, EmptyState, Flash, LinkButton, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { AgeingTable } from "./_components/ageing-table";
import { BillingNav } from "./_components/billing-nav";

export const metadata = { title: "Billing & Outstanding" };

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

  return (
    <>
      <PageHeader
        title="Billing & Outstanding"
        subtitle="Customer receivables, vendor payables and collections"
        actions={<>
          <a href="/billing/export/receivables" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-muted"><Download className="h-4 w-4" aria-hidden /> Receivables</a>
          <a href="/billing/export/payables" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-muted"><Download className="h-4 w-4" aria-hidden /> Payables</a>
          {write && <LinkButton href="/billing/invoices/new"><Plus className="h-4 w-4" aria-hidden /> New invoice</LinkButton>}
        </>}
      />
      <BillingNav active="/billing" />
      <Flash ok={sp.ok} err={sp.err} />

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">Receivables (customers)</h2>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total outstanding" value={moneyShort(rt.outstanding)} hint={`${recv.length} customer${recv.length === 1 ? "" : "s"}`} href="/billing/receivables" />
        <Stat label="Overdue" value={moneyShort(rt.overdue)} tone={rt.overdue > 0 ? "bad" : "good"} hint="past due date" href="/billing/invoices?overdue=1" />
        <Stat label="Over 90 days" value={moneyShort(rt.d90p)} tone={rt.d90p > 0 ? "bad" : "default"} hint="follow up by phone" />
        <Stat label="Collected this month" value={moneyShort(month.in.total)} tone="good" hint={`${month.in.count} receipt${month.in.count === 1 ? "" : "s"} since ${fmtDate(monthStart)}`} href="/billing/payments?direction=in" />
      </div>
      <div className="mb-8">
        <AgeingTable rows={recv} limit={10} hrefFor={(id) => `/billing/receivables/${id}`} emptyTitle="No customer outstanding — all invoices are paid." />
        {recv.length > 10 && <p className="mt-2 text-sm"><Link href="/billing/receivables" className="text-brand-700 hover:underline dark:text-brand-300">View all {recv.length} customers →</Link></p>}
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">Payables (vendors)</h2>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total payable" value={moneyShort(pt.outstanding)} hint={`${pay.length} vendor${pay.length === 1 ? "" : "s"}`} href="/billing/payables" />
        <Stat label="Overdue" value={moneyShort(pt.overdue)} tone={pt.overdue > 0 ? "warn" : "good"} hint={`${overduePI} invoice${overduePI === 1 ? "" : "s"}`} />
        <Stat label="Due in next 7 days" value={moneyShort(dueSoon.reduce((s, p) => s + p.outstanding, 0))} hint={`${dueSoon.length} invoice${dueSoon.length === 1 ? "" : "s"}`} />
        <Stat label="Paid this month" value={moneyShort(month.out.total)} hint={`${month.out.count} payment${month.out.count === 1 ? "" : "s"}`} href="/billing/payments?direction=out" />
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <AgeingTable rows={pay} limit={10} hrefFor={(id) => `/billing/payables?vendor=${id}`} emptyTitle="No vendor payables outstanding." />
        </div>
        <Card title="Vendor bills due in the next 7 days" className="xl:col-span-2" bodyClassName={dueSoon.length ? "p-0" : undefined}>
          {dueSoon.length === 0 ? <EmptyState title="Nothing due this week" /> : (
            <Table className="rounded-none border-0 shadow-none">
              <thead><tr><Th>Vendor / bill</Th><Th>Due</Th><Th className="text-right">Balance</Th></tr></thead>
              <tbody>
                {dueSoon.map((p) => (
                  <tr key={p.id}>
                    <Td className="max-w-48"><div className="truncate">{p.partyName}</div><div className="text-xs text-ink-soft">{p.number}</div></Td>
                    <Td className="whitespace-nowrap">{fmtDate(p.dueDate)}{p.daysOverdue === 0 && <div><Badge tone="amber">today</Badge></div>}</Td>
                    <Td className="text-right tabular-nums">{money(p.outstanding)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
      <p className="mt-4 text-xs text-ink-faint">Ageing buckets are by days past the due date. Payables include posted purchase invoices only; due date defaults to invoice date + vendor credit days. Amounts in ₹ (INR).</p>
    </>
  );
}
