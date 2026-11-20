import Link from "next/link";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, payments, purchaseInvoices, salesInvoices, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { PAYMENT_MODES } from "@/lib/constants";
import { fmtDate, money, round2, todayIST } from "@/lib/format";
import { openPurchaseInvoices } from "@/lib/billing";
import { Badge, Button, Card, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { recordVendorPayment } from "../actions";
import { BillingNav } from "../_components/billing-nav";

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

  return (
    <>
      <PageHeader title="Payments" subtitle="Receipts from customers and payments to vendors" />
      <BillingNav active="/billing/payments" />
      <Flash ok={sp.ok} err={sp.err} />

      {write && (
        <Card title="Record vendor payment" className="mb-4">
          {openPI.length === 0 ? <p className="text-sm text-ink-soft">No unpaid posted purchase invoices.</p> : (
            <form action={recordVendorPayment} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
              <input type="hidden" name="back" value="/billing/payments" />
              <Field label="Purchase invoice" className="sm:col-span-2" required>
                <Select name="purchaseInvoiceId" required defaultValue="">
                  <option value="" disabled>Select vendor bill</option>
                  {openPI.map((p) => <option key={p.id} value={p.id}>{p.partyName} · {p.number} · bal {money(p.outstanding)}{p.daysOverdue > 0 ? ` · ${p.daysOverdue}d overdue` : ""}</option>)}
                </Select>
              </Field>
              <Field label="Amount (₹)" required><Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" required /></Field>
              <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
              <Field label="Mode" required><Select name="mode" defaultValue="bank">{PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select></Field>
              <Field label="Reference"><Input name="reference" maxLength={80} placeholder="UTR / cheque no." /></Field>
              <div className="sm:col-span-2 lg:col-span-6"><SubmitButton variant="success" pendingText="Saving…">Record vendor payment</SubmitButton></div>
            </form>
          )}
          <p className="mt-2 text-xs text-ink-soft">Customer receipts are recorded on the invoice page (Invoices → open invoice → Record payment).</p>
        </Card>
      )}

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 lg:items-end" aria-label="Filter payments">
        <Field label="Direction">
          <Select name="direction" defaultValue={direction ?? ""}>
            <option value="">In & out</option><option value="in">Received (in)</option><option value="out">Paid (out)</option>
          </Select>
        </Field>
        <Field label="Mode">
          <Select name="mode" defaultValue={mode ?? ""}><option value="">All modes</option>{PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select>
        </Field>
        <Field label="From"><Input type="date" name="from" defaultValue={from} /></Field>
        <Field label="To"><Input type="date" name="to" defaultValue={to} /></Field>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">Filter</Button>
          {filtered && <LinkButton href="/billing/payments" variant="ghost">Clear</LinkButton>}
        </div>
      </form>

      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <span>Received: <strong className="tabular-nums text-emerald-600">{money(totIn)}</strong></span>
        <span>Paid: <strong className="tabular-nums">{money(totOut)}</strong></span>
        <span className="text-ink-soft">({rows.length} entr{rows.length === 1 ? "y" : "ies"}{rows.length === 500 ? ", latest 500" : ""})</span>
      </div>

      {rows.length === 0 ? <EmptyState title={filtered ? "No payments match these filters" : "No payments recorded yet"} /> : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Type</Th><Th>Party</Th><Th>Against</Th><Th>Mode</Th><Th>Reference</Th><Th className="text-right">Amount</Th></tr></thead>
          <tbody>
            {rows.map(({ p, customerName, vendorName, siNumber, piNumber }) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap">{fmtDate(p.date)}</Td>
                <Td>{p.direction === "in" ? <Badge tone="green">Received</Badge> : <Badge tone="blue">Paid</Badge>}</Td>
                <Td className="max-w-56 truncate">
                  {p.direction === "in" && p.customerId ? <Link href={`/billing/receivables/${p.customerId}`} className="hover:underline">{customerName ?? "—"}</Link>
                    : p.vendorId ? <Link href={`/billing/payables?vendor=${p.vendorId}`} className="hover:underline">{vendorName ?? "—"}</Link> : "—"}
                </Td>
                <Td>{p.salesInvoiceId ? <Link href={`/billing/invoices/${p.salesInvoiceId}`} className="text-brand-700 hover:underline dark:text-brand-300">{siNumber}</Link> : piNumber ?? "—"}</Td>
                <Td className="uppercase">{p.mode}</Td>
                <Td>{p.reference || "—"}</Td>
                <Td className={`text-right tabular-nums ${p.direction === "in" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{money(p.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
