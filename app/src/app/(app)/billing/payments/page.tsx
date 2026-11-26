import Link from "next/link";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { HandCoins, Send } from "lucide-react";
import { getDb } from "@/db";
import { customers, payments, purchaseInvoices, salesInvoices, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { PAYMENT_MODES } from "@/lib/constants";
import { fmtDate, money, round2, todayIST } from "@/lib/format";
import { openPurchaseInvoices, receiptNumber } from "@/lib/billing";
import { Field, Flash, Input, LinkButton, Select } from "@/components/ui";
import {
  FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, type Column,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { recordVendorPayment } from "../actions";
import { BillingTabs } from "../_components/billing-tabs";

export const metadata = { title: "Payments" };
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ direction?: string; mode?: string; from?: string; to?: string; ok?: string; err?: string }> }) {
  const user = await requireUser("billing");
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();
  const direction = sp.direction === "in" || sp.direction === "out" ? sp.direction : undefined;
  const mode = (PAYMENT_MODES as readonly string[]).includes(sp.mode ?? "") ? sp.mode : undefined;
  const from = isDate(sp.from) ? sp.from : undefined;
  const to = isDate(sp.to) ? sp.to : undefined;

  const where: SQL[] = [];
  if (direction) where.push(eq(payments.direction, direction));
  if (mode) where.push(eq(payments.mode, mode));
  if (from) where.push(gte(payments.date, from));
  if (to) where.push(lte(payments.date, to));
  const rows = await db
    .select({
      p: payments, customerName: customers.name, vendorName: vendors.name, siNumber: salesInvoices.number, piNumber: purchaseInvoices.invoiceNo,
    })
    .from(payments)
    .leftJoin(customers, eq(customers.id, payments.customerId))
    .leftJoin(vendors, eq(vendors.id, payments.vendorId))
    .leftJoin(salesInvoices, eq(salesInvoices.id, payments.salesInvoiceId))
    .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, payments.purchaseInvoiceId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(payments.date), desc(payments.id))
    .limit(500);
  const totIn = round2(rows.filter((r) => r.p.direction === "in").reduce((s, r) => s + Number(r.p.amount), 0));
  const totOut = round2(rows.filter((r) => r.p.direction === "out").reduce((s, r) => s + Number(r.p.amount), 0));
  const write = canWrite(user.role, "billing");
  const openPI = write ? await openPurchaseInvoices(db, { today }) : [];
  const filtered = !!(direction || mode || from || to);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ direction, mode, from, to, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/billing/payments?${s}` : "/billing/payments";
  };
  const activeFilters = [mode, from, to].filter(Boolean).length;

  type Row = (typeof rows)[number];
  const cols: Column<Row>[] = [
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: ({ p }) => fmtDate(p.date) },
    {
      key: "party", header: "Party", card: "title", className: "max-w-56 truncate",
      cell: ({ p, customerName, vendorName }) => p.direction === "in" && p.customerId
        ? <Link href={`/billing/receivables/${p.customerId}`} className="font-medium hover:underline">{customerName ?? "-"}</Link>
        : p.vendorId ? <Link href={`/billing/payables?vendor=${p.vendorId}`} className="font-medium hover:underline">{vendorName ?? "-"}</Link> : "-",
    },
    {
      key: "type", header: "Type", card: "badge",
      cell: ({ p }) => p.direction === "in"
        ? (p.isAdvance ? <StatusPill semantic="progress" label="Advance" /> : <StatusPill semantic="success" label="Received" />)
        : <StatusPill semantic="info" label="Paid" />,
    },
    {
      key: "against", header: "Against",
      cell: ({ p, siNumber, piNumber }) => p.salesInvoiceId
        ? <Link href={`/billing/invoices/${p.salesInvoiceId}`} className="text-brand-700 hover:underline dark:text-brand-300">{siNumber}</Link>
        : piNumber ?? (p.isAdvance ? (p.allocatedAmount ? `${money(p.allocatedAmount)} applied` : "Not applied yet") : "-"),
    },
    { key: "mode", header: "Mode", priority: 3, className: "uppercase", cell: ({ p }) => p.mode },
    {
      key: "ref", header: "Reference", priority: 3,
      cell: ({ p }) => p.direction === "in"
        ? <Link href={`/billing/receipts/${p.id}`} className="text-brand-700 hover:underline dark:text-brand-300">{p.reference || receiptNumber(p)}</Link>
        : p.reference || "-",
    },
    {
      key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true,
      cell: ({ p }) => <span className={p.direction === "in" ? "text-success" : undefined}>{money(p.amount)}</span>,
    },
  ];

  return (
    <ListPage
      title="Payments"
      subtitle="Receipts from customers and payments to vendors."
      secondaryActions={write && <LinkButton href="/billing/advances" variant="secondary"><HandCoins className="icon-sm" aria-hidden /> Record advance</LinkButton>}
      tabs={<BillingTabs active="payments" />}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={
        <>
          {write && (
            <SectionCard title="Record vendor payment" icon={Send}
              description="Customer receipts are recorded on the invoice page with Record payment. Money received before invoicing goes under Advances."
              empty={openPI.length === 0 && "No unpaid posted purchase invoices."}>
              <form action={recordVendorPayment} className="space-y-4">
                <input type="hidden" name="back" value="/billing/payments" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                  <Field label="Purchase invoice" className="sm:col-span-2" required>
                    <Select name="purchaseInvoiceId" required defaultValue="">
                      <option value="" disabled>Select vendor bill</option>
                      {openPI.map((p) => <option key={p.id} value={p.id}>{p.partyName} · {p.number} · balance {money(p.outstanding)}{p.daysOverdue > 0 ? ` · ${p.daysOverdue} days overdue` : ""}</option>)}
                    </Select>
                  </Field>
                  <Field label="Amount (₹)" required><Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" className="text-right" required /></Field>
                  <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
                  <Field label="Mode" required><Select name="mode" defaultValue="bank">{PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select></Field>
                  <Field label="Reference"><Input name="reference" maxLength={80} placeholder="UTR or cheque no." /></Field>
                </div>
                <div className="flex justify-end">
                  <SubmitButton variant="success" pendingText="Saving…" className="max-sm:w-full">Record vendor payment</SubmitButton>
                </div>
              </form>
            </SectionCard>
          )}
          <MetricStrip className="lg:grid-cols-3">
            <Metric label="Received" value={money(totIn)} tone="good" href={qs({ direction: "in" })} />
            <Metric label="Paid" value={money(totOut)} href={qs({ direction: "out" })} />
            <Metric label="Entries" value={rows.length} hint={rows.length === 500 ? "Showing the latest 500" : filtered ? "Matching these filters" : undefined} />
          </MetricStrip>
        </>
      }
      filters={
        <>
          <FilterPills label="Filter by direction" items={[
            { label: "In and out", href: qs({ direction: undefined }), active: !direction },
            { label: "Received", href: qs({ direction: "in" }), active: direction === "in" },
            { label: "Paid", href: qs({ direction: "out" }), active: direction === "out" },
          ]} />
          <ListFilters searchName={false} clearHref={qs({ mode: undefined, from: undefined, to: undefined })} activeCount={activeFilters} hidden={{ direction }}>
            <Select name="mode" defaultValue={mode ?? ""} aria-label="Mode">
              <option value="">All modes</option>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </Select>
            <Input type="date" name="from" defaultValue={from} aria-label="From date" title="From date" />
            <Input type="date" name="to" defaultValue={to} aria-label="To date" title="To date" />
          </ListFilters>
        </>
      }
      isEmpty={rows.length === 0}
      empty={<ListEmpty filtered={filtered} noun="payments" clearHref="/billing/payments">Customer receipts, advances and vendor payments show up here once recorded.</ListEmpty>}
      resultSummary={`${rows.length} entr${rows.length === 1 ? "y" : "ies"}${rows.length === 500 ? ", latest 500" : ""}`}
    >
      <ResponsiveTable rows={rows} columns={cols} rowKey={({ p }) => p.id} caption="Payments" />
    </ListPage>
  );
}
