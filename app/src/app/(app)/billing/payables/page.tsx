import { Download } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { PAYMENT_MODES } from "@/lib/constants";
import { fmtDate, money, moneyShort, todayIST } from "@/lib/format";
import { openPurchaseInvoices, sumAgeing, vendorOutstanding } from "@/lib/billing";
import { Badge, Card, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Select, Stat, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { recordVendorPayment } from "../actions";
import { AgeingTable } from "../_components/ageing-table";
import { BillingNav } from "../_components/billing-nav";
import Link from "next/link";

export const metadata = { title: "Vendor payables" };

export default async function PayablesPage({ searchParams }: { searchParams: Promise<{ vendor?: string; ok?: string; err?: string }> }) {
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

  return (
    <>
      <PageHeader title="Vendor outstanding" subtitle="Posted purchase invoices with balance payable. Net payable takes off debit notes not yet adjusted."
        actions={<a href="/billing/export/payables" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-muted"><Download className="h-4 w-4" aria-hidden /> Export Excel</a>} />
      <BillingNav active="/billing/payables" />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net payable" value={moneyShort(t.netDue)} hint={t.debitNotes ? `Bills ${moneyShort(t.outstanding)} less debit notes ${moneyShort(t.debitNotes)}` : undefined} />
        <Stat label="Overdue" value={moneyShort(t.overdue)} tone={t.overdue ? "warn" : "good"} />
        <Stat label="Due in 7 days" value={moneyShort(t.dueNext7)} />
        <Stat label="90+ days" value={moneyShort(t.d90p)} tone={t.d90p ? "bad" : "default"} />
      </div>
      <div className="mb-6">
        <AgeingTable kind="vendor" rows={rows} hrefFor={(id) => `/billing/payables?vendor=${id}#bills`} emptyTitle="No vendor payables outstanding." />
      </div>

      <Card
        title={<span id="bills">Unpaid purchase bills{vendorName ? `: ${vendorName}` : ""} ({docs.length})</span>}
        actions={vendorId ? <LinkButton href="/billing/payables" variant="ghost" size="sm">All vendors</LinkButton> : undefined}
        bodyClassName={docs.length ? "p-0" : undefined}
      >
        {docs.length === 0 ? <EmptyState title="No unpaid bills" /> : (
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>Vendor</Th><Th>Bill no.</Th><Th>Bill date</Th><Th>Due</Th><Th className="text-right">Total</Th><Th className="text-right">Paid</Th><Th className="text-right">Balance</Th>{write && <Th><span className="sr-only">Pay</span></Th>}</tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <Td className="max-w-52 truncate">{d.partyName}</Td>
                  <Td>{purchasesLink ? <Link href={`/purchases/${d.id}`} className="text-brand-700 hover:underline dark:text-brand-300">{d.number}</Link> : d.number}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(d.invoiceDate)}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(d.dueDate)}{d.daysOverdue > 0 ? <div><Badge tone="red">{d.daysOverdue}d overdue</Badge></div> : d.daysOverdue >= -7 ? <div><Badge tone="amber">{d.daysOverdue === 0 ? "today" : `in ${-d.daysOverdue}d`}</Badge></div> : null}</Td>
                  <Td className="text-right tabular-nums">{money(d.total)}</Td>
                  <Td className="text-right tabular-nums">{money(d.paidAmount)}</Td>
                  <Td className="text-right font-medium tabular-nums">{money(d.outstanding)}</Td>
                  {write && (
                    <Td>
                      <details>
                        <summary className="cursor-pointer select-none rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-muted dark:text-brand-300">Pay</summary>
                        <form action={recordVendorPayment} className="mt-2 grid w-60 gap-2 rounded-lg border border-line bg-surface p-3 shadow-sm">
                          <input type="hidden" name="purchaseInvoiceId" value={d.id} />
                          <input type="hidden" name="back" value={back} />
                          <Field label="Amount (₹)"><Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={d.outstanding + 0.5} defaultValue={d.outstanding} required /></Field>
                          <Field label="Date"><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
                          <Field label="Mode"><Select name="mode" defaultValue="bank">{PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select></Field>
                          <Field label="Reference"><Input name="reference" maxLength={80} placeholder="UTR / cheque no." /></Field>
                          <SubmitButton size="sm" variant="success" pendingText="Saving…">Record payment</SubmitButton>
                        </form>
                      </details>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
