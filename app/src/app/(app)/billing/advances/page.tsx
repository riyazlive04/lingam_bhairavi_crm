import Link from "next/link";
import { asc, desc, eq, inArray, ne } from "drizzle-orm";
import { HandCoins, Printer } from "lucide-react";
import { getDb } from "@/db";
import { customers, projects, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { PAYMENT_MODES } from "@/lib/constants";
import { fmtDate, money, moneyShort, round2, todayIST } from "@/lib/format";
import { customerAdvances, receiptNumber } from "@/lib/billing";
import { EmptyState, Field, Flash, Input, LinkButton, Select } from "@/components/ui";
import {
  Callout, FilterPills, KeyValueGrid, ListPage, Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, type Column,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { recordAdvance } from "../actions";
import { BillingTabs } from "../_components/billing-tabs";

export const metadata = { title: "Advances" };

type SP = { orderId?: string; customerId?: string; from?: string; receipt?: string; open?: string; ok?: string; err?: string };

export default async function AdvancesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("billing");
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();
  const write = canWrite(user.role, "billing");
  const orderId = Number(sp.orderId) || undefined;
  const customerFilter = Number(sp.customerId) || undefined;
  const openOnly = sp.open === "1";
  const receiptId = Number(sp.receipt) || undefined;

  const [order] = orderId
    ? await db.select({ o: salesOrders, customerName: customers.name, projectName: projects.name }).from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId)).leftJoin(projects, eq(projects.id, salesOrders.projectId))
      .where(eq(salesOrders.id, orderId))
    : [];
  const [rows, custList, orderList, projList] = await Promise.all([
    customerAdvances(db, { customerId: customerFilter, openOnly }),
    write && !order ? db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name)) : Promise.resolve([]),
    write && !order ? db.select({ id: salesOrders.id, number: salesOrders.number, customerName: customers.name, total: salesOrders.total }).from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(inArray(salesOrders.status, ["open", "partial", "delivered"])).orderBy(desc(salesOrders.orderDate)).limit(300) : Promise.resolve([]),
    write && !order ? db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).where(ne(projects.status, "closed")).orderBy(desc(projects.id)).limit(300) : Promise.resolve([]),
  ]);
  const shown = [...rows].reverse();
  const totalAmt = round2(rows.reduce((s, r) => s + r.amount, 0));
  const unused = round2(rows.reduce((s, r) => s + r.balance, 0));
  const ordersLink = canRead(user.role, "orders");
  const half = order ? round2(Number(order.o.total) * 0.5) : undefined;
  const listHref = (open: boolean) => {
    const p = new URLSearchParams();
    if (customerFilter) p.set("customerId", String(customerFilter));
    if (open) p.set("open", "1");
    const s = p.toString();
    return s ? `/billing/advances?${s}` : "/billing/advances";
  };

  type Adv = (typeof shown)[number];
  const cols: Column<Adv>[] = [
    {
      key: "receipt", header: "Receipt", card: "title", nowrap: true,
      cell: (a) => <><Link href={`/billing/receipts/${a.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{receiptNumber(a)}</Link>{a.reference && <div className="text-caption font-normal text-ink-soft">{a.reference}</div>}</>,
    },
    { key: "date", header: "Date", nowrap: true, cell: (a) => fmtDate(a.date) },
    { key: "customer", header: "Customer", card: "subtitle", className: "max-w-56 truncate", cell: (a) => <Link href={`/billing/receivables/${a.customerId}`} className="relative z-[1] hover:underline">{a.customerName}</Link> },
    { key: "order", header: "Order", cell: (a) => a.orderId && a.orderNumber ? (ordersLink ? <Link href={`/orders/${a.orderId}`} className="relative z-[1] text-brand-700 hover:underline dark:text-brand-300">{a.orderNumber}</Link> : a.orderNumber) : "-" },
    { key: "mode", header: "Mode", priority: 3, className: "uppercase", cell: (a) => a.mode },
    { key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true, cell: (a) => money(a.amount) },
    { key: "applied", header: "Applied", align: "right", nowrap: true, priority: 3, cell: (a) => (a.allocatedAmount ? money(a.allocatedAmount) : "-") },
    {
      key: "balance", header: "Balance", align: "right", card: "badge", nowrap: true,
      cell: (a) => (a.balance > 0.005 ? <span className="font-medium">{money(a.balance)}<span className="sm:hidden"> to apply</span></span> : <StatusPill semantic="success" label="Used" />),
    },
  ];

  return (
    <ListPage
      title="Advances"
      subtitle="Money received before invoicing, for example the 50% advance against a customer PO."
      tabs={<BillingTabs active="advances" />}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {receiptId && sp.ok && (
            <Callout tone="success" title="Advance recorded"
              action={<LinkButton href={`/billing/receipts/${receiptId}`} variant="secondary" size="sm"><Printer className="icon-sm" aria-hidden /> Print receipt</LinkButton>}>
              Give the customer a receipt for the advance.
            </Callout>
          )}
        </>
      }
      stats={
        <>
          <MetricStrip className="lg:grid-cols-3">
            <Metric label="Advances received" value={moneyShort(totalAmt)} hint={`${rows.length} receipt${rows.length === 1 ? "" : "s"}${openOnly ? " with a balance" : ""}`} />
            <Metric label="Not yet applied" value={moneyShort(unused)} tone={unused > 0 ? "warn" : "default"} hint="Apply these on the invoice page" />
            <Metric label="Applied to invoices" value={moneyShort(round2(totalAmt - unused))} tone="good" />
          </MetricStrip>

          {write && (
            <SectionCard title="Record advance" icon={HandCoins} description="Later, apply it on the invoice page with Apply advance.">
              <form action={recordAdvance} className="space-y-4">
                {orderId && !order && <Callout tone="warning">We couldn&apos;t find that order. Choose the customer below.</Callout>}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {order ? (
                    <>
                      <input type="hidden" name="customerId" value={order.o.customerId} />
                      <input type="hidden" name="orderId" value={order.o.id} />
                      {sp.from === "order" && <input type="hidden" name="from" value="order" />}
                      <div className="rounded-xl border border-line bg-surface-2 p-4 sm:col-span-2 lg:col-span-4">
                        <KeyValueGrid columns={3} items={[
                          ["Customer", order.customerName],
                          ["Order", `${order.o.number}${order.o.customerPoNumber ? ` (PO ${order.o.customerPoNumber})` : ""}`],
                          ["Project", order.projectName || "-"],
                          ["Order value (before GST)", money(order.o.total)],
                        ]} />
                      </div>
                    </>
                  ) : (
                    <>
                      <Field label="Customer" required className="sm:col-span-2">
                        <Select name="customerId" required defaultValue={customerFilter ? String(customerFilter) : ""}>
                          <option value="" disabled>Select customer</option>
                          {custList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                      </Field>
                      <Field label="Against order" hint="Optional. Must be this customer's order.">
                        <Select name="orderId" defaultValue="">
                          <option value="">No order</option>
                          {orderList.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.customerName}</option>)}
                        </Select>
                      </Field>
                      <Field label="Project" hint="Optional. Taken from the order when blank.">
                        <Select name="projectId" defaultValue="">
                          <option value="">No project</option>
                          {projList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                        </Select>
                      </Field>
                    </>
                  )}
                  <Field label="Amount (₹)" required hint={half ? `50% of the order value is ${money(half)}` : undefined}>
                    <Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" defaultValue={half} className="text-right" required />
                  </Field>
                  <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
                  <Field label="Mode" required><Select name="mode" defaultValue="bank">{PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select></Field>
                  <Field label="Reference"><Input name="reference" maxLength={80} placeholder="UTR or cheque no." /></Field>
                  <Field label="Notes" className="sm:col-span-2 lg:col-span-4"><Input name="notes" maxLength={1000} placeholder="For example: 50% advance as per quotation terms" /></Field>
                </div>
                <div className="flex justify-end">
                  <SubmitButton variant="success" pendingText="Saving…" className="max-sm:w-full">Record advance</SubmitButton>
                </div>
              </form>
            </SectionCard>
          )}
        </>
      }
      filters={
        <FilterPills label="Filter advances" items={[
          { label: "All advances", href: listHref(false), active: !openOnly },
          { label: "With balance to apply", href: listHref(true), active: openOnly, attention: !openOnly && unused > 0 },
        ]} />
      }
      isEmpty={shown.length === 0}
      empty={
        <EmptyState title={openOnly ? "No advances waiting to be applied" : "No advances yet"}>
          Record an advance when the customer pays before you invoice. Later, apply it on the invoice page with Apply advance.
        </EmptyState>
      }
      resultSummary={`${shown.length} advance${shown.length === 1 ? "" : "s"}`}
    >
      <ResponsiveTable rows={shown} columns={cols} rowKey={(a) => a.id} caption="Advances" />
    </ListPage>
  );
}
