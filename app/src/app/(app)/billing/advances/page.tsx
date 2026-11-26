import Link from "next/link";
import { asc, desc, eq, inArray, ne } from "drizzle-orm";
import { Printer } from "lucide-react";
import { getDb } from "@/db";
import { customers, projects, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { PAYMENT_MODES } from "@/lib/constants";
import { fmtDate, money, moneyShort, round2, todayIST } from "@/lib/format";
import { customerAdvances, receiptNumber } from "@/lib/billing";
import { Badge, Card, DL, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Select, Stat, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { recordAdvance } from "../actions";
import { BillingNav } from "../_components/billing-nav";

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

  return (
    <>
      <PageHeader title="Advances" subtitle="Money received before invoicing, for example the 50% advance against a customer PO" />
      <BillingNav active="/billing/advances" />
      <Flash ok={sp.ok} err={sp.err} />
      {receiptId && sp.ok && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <LinkButton href={`/billing/receipts/${receiptId}`} variant="secondary" size="sm"><Printer className="h-4 w-4" aria-hidden /> Print receipt</LinkButton>
          <span className="text-ink-soft">Give the customer a receipt for the advance.</span>
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Advances received" value={moneyShort(totalAmt)} hint={`${rows.length} receipt${rows.length === 1 ? "" : "s"}${openOnly ? " with balance" : ""}`} />
        <Stat label="Not yet applied" value={moneyShort(unused)} tone={unused > 0 ? "warn" : "default"} hint="apply these on the invoice page" />
        <Stat label="Applied to invoices" value={moneyShort(round2(totalAmt - unused))} tone="good" />
      </div>

      {write && (
        <Card title="Record advance" className="mb-4">
          {orderId && !order && <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">We couldn&apos;t find that order. Choose the customer below.</p>}
          <form action={recordAdvance} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            {order ? (
              <>
                <input type="hidden" name="customerId" value={order.o.customerId} />
                <input type="hidden" name="orderId" value={order.o.id} />
                {sp.from === "order" && <input type="hidden" name="from" value="order" />}
                <div className="sm:col-span-2 lg:col-span-4">
                  <DL items={[
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
                <Field label="Against order" hint="Optional. Must be this customer's order">
                  <Select name="orderId" defaultValue="">
                    <option value="">No order</option>
                    {orderList.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.customerName}</option>)}
                  </Select>
                </Field>
                <Field label="Project" hint="Optional. Taken from the order when blank">
                  <Select name="projectId" defaultValue="">
                    <option value="">No project</option>
                    {projList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                  </Select>
                </Field>
              </>
            )}
            <Field label="Amount (₹)" required hint={half ? `50% of the order value is ${money(half)}` : undefined}>
              <Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" defaultValue={half} required />
            </Field>
            <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
            <Field label="Mode" required><Select name="mode" defaultValue="bank">{PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</Select></Field>
            <Field label="Reference"><Input name="reference" maxLength={80} placeholder="UTR / cheque no." /></Field>
            <Field label="Notes" className="sm:col-span-2 lg:col-span-3"><Input name="notes" maxLength={1000} placeholder="e.g. 50% advance as per quotation terms" /></Field>
            <div><SubmitButton variant="success" pendingText="Saving…">Record advance</SubmitButton></div>
          </form>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <LinkButton href="/billing/advances" variant={openOnly ? "ghost" : "secondary"} size="sm">All advances</LinkButton>
        <LinkButton href="/billing/advances?open=1" variant={openOnly ? "secondary" : "ghost"} size="sm">With balance to apply</LinkButton>
      </div>
      {shown.length === 0 ? (
        <EmptyState title={openOnly ? "No advances waiting to be applied" : "No advances recorded yet"}>
          Record an advance when the customer pays before you invoice. Later, apply it on the invoice page with &quot;Apply advance&quot;.
        </EmptyState>
      ) : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Receipt</Th><Th>Customer</Th><Th>Order</Th><Th>Mode</Th><Th className="text-right">Amount</Th><Th className="text-right">Applied</Th><Th className="text-right">Balance</Th></tr></thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap">{fmtDate(a.date)}</Td>
                <Td><Link href={`/billing/receipts/${a.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{receiptNumber(a)}</Link>{a.reference && <div className="text-xs text-ink-soft">{a.reference}</div>}</Td>
                <Td className="max-w-56 truncate"><Link href={`/billing/receivables/${a.customerId}`} className="hover:underline">{a.customerName}</Link></Td>
                <Td>{a.orderId && a.orderNumber ? (ordersLink ? <Link href={`/orders/${a.orderId}`} className="text-brand-700 hover:underline dark:text-brand-300">{a.orderNumber}</Link> : a.orderNumber) : "-"}</Td>
                <Td className="uppercase">{a.mode}</Td>
                <Td className="text-right tabular-nums">{money(a.amount)}</Td>
                <Td className="text-right tabular-nums">{a.allocatedAmount ? money(a.allocatedAmount) : "-"}</Td>
                <Td className="text-right font-medium tabular-nums">{a.balance > 0.005 ? money(a.balance) : <Badge tone="green">Used</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
