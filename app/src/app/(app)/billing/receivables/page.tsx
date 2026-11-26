import { Download } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { moneyShort, todayIST } from "@/lib/format";
import { customerOutstanding, sumAgeing } from "@/lib/billing";
import { Flash, PageHeader, Stat } from "@/components/ui";
import { AgeingTable } from "../_components/ageing-table";
import { BillingNav } from "../_components/billing-nav";

export const metadata = { title: "Receivables" };

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireUser("billing");
  const sp = await searchParams;
  const db = await getDb();
  const rows = await customerOutstanding(db, todayIST());
  const t = sumAgeing(rows);
  return (
    <>
      <PageHeader title="Customer outstanding" subtitle="Receivables by customer with ageing (days past due). Net due takes off credit notes and advances not yet used."
        actions={<a href="/billing/export/receivables" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-muted"><Download className="h-4 w-4" aria-hidden /> Export Excel</a>} />
      <BillingNav active="/billing/receivables" />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net due" value={moneyShort(t.netDue)} hint={`Invoices ${moneyShort(t.outstanding)} · credits ${moneyShort(t.creditNotes)} · advances ${moneyShort(t.advances)}`} />
        <Stat label="Overdue" value={moneyShort(t.overdue)} tone={t.overdue ? "bad" : "good"} />
        <Stat label="Due in 7 days" value={moneyShort(t.dueNext7)} tone="warn" />
        <Stat label="90+ days" value={moneyShort(t.d90p)} tone={t.d90p ? "bad" : "default"} />
      </div>
      <AgeingTable kind="customer" rows={rows} hrefFor={(id) => `/billing/receivables/${id}`} emptyTitle="Nothing outstanding. All customer invoices are paid." />
    </>
  );
}
