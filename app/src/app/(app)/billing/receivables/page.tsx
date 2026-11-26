import { Download } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { moneyShort, todayIST } from "@/lib/format";
import { customerOutstanding, sumAgeing } from "@/lib/billing";
import { EmptyState, Flash, buttonClass } from "@/components/ui";
import { ListPage, Metric, MetricStrip } from "@/components/patterns";
import { AgeingTable } from "../_components/ageing-table";
import { BillingTabs } from "../_components/billing-tabs";

export const metadata = { title: "Receivables" };

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireUser("billing");
  const sp = await searchParams;
  const db = await getDb();
  const rows = await customerOutstanding(db, todayIST());
  const t = sumAgeing(rows);
  return (
    <ListPage
      title="Customer outstanding"
      subtitle="Receivables by customer with ageing (days past due). Net due takes off credit notes and advances not yet used."
      secondaryActions={<a href="/billing/export/receivables" className={buttonClass("secondary")}><Download className="icon-sm" aria-hidden /> Download Excel</a>}
      notices={<><BillingTabs active="receivables" /><Flash ok={sp.ok} err={sp.err} /></>}
      stats={
        <MetricStrip>
          <Metric label="Net due" value={moneyShort(t.netDue)} hint={`Invoices ${moneyShort(t.outstanding)} · credits ${moneyShort(t.creditNotes)} · advances ${moneyShort(t.advances)}`} />
          <Metric label="Overdue" value={moneyShort(t.overdue)} tone={t.overdue ? "bad" : "good"} />
          <Metric label="Due in 7 days" value={moneyShort(t.dueNext7)} tone="warn" />
          <Metric label="Over 90 days" value={moneyShort(t.d90p)} tone={t.d90p ? "bad" : "default"} />
        </MetricStrip>
      }
      isEmpty={rows.length === 0}
      empty={<EmptyState title="Nothing outstanding">All customer invoices are paid. New invoices show up here until they are settled.</EmptyState>}
      resultSummary={`${rows.length} customer${rows.length === 1 ? "" : "s"} with a balance`}
    >
      <AgeingTable kind="customer" rows={rows} hrefFor={(id) => `/billing/receivables/${id}`} emptyTitle="Nothing outstanding" />
    </ListPage>
  );
}
