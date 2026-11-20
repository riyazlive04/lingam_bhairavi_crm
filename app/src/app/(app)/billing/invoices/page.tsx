import Link from "next/link";
import { and, asc, desc, eq, ilike, inArray, lt, or, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, salesInvoices, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { daysBetween, fmtDate, money, todayIST } from "@/lib/format";
import { OPEN_INVOICE_STATUSES, outstandingOf } from "@/lib/billing";
import { Badge, Button, EmptyState, Flash, Input, LinkButton, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { BillingNav } from "../_components/billing-nav";

export const metadata = { title: "Sales invoices" };
const STATUSES = ["issued", "partially_paid", "paid", "cancelled"] as const;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; customer?: string; overdue?: string; ok?: string; err?: string }> }) {
  const user = await requireUser("billing");
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const customerId = Number(sp.customer) || undefined;
  const q = sp.q?.trim();

  const where: SQL[] = [];
  if (status) where.push(eq(salesInvoices.status, status));
  if (customerId) where.push(eq(salesInvoices.customerId, customerId));
  if (sp.overdue === "1") {
    where.push(inArray(salesInvoices.status, [...OPEN_INVOICE_STATUSES]));
    where.push(lt(salesInvoices.dueDate, today));
  }
  if (q) {
    const c = or(ilike(salesInvoices.number, `%${q}%`), ilike(customers.name, `%${q}%`), ilike(salesOrders.customerPoNumber, `%${q}%`));
    if (c) where.push(c);
  }
  const rows = await db
    .select({
      id: salesInvoices.id, number: salesInvoices.number, invoiceDate: salesInvoices.invoiceDate, dueDate: salesInvoices.dueDate,
      total: salesInvoices.total, paidAmount: salesInvoices.paidAmount, status: salesInvoices.status, reminderCount: salesInvoices.reminderCount,
      customerId: salesInvoices.customerId, customerName: customers.name, orderNumber: salesOrders.number, orderId: salesInvoices.orderId,
    })
    .from(salesInvoices)
    .leftJoin(customers, eq(customers.id, salesInvoices.customerId))
    .leftJoin(salesOrders, eq(salesOrders.id, salesInvoices.orderId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(salesInvoices.invoiceDate), desc(salesInvoices.id))
    .limit(300);
  const custList = await db.select({ id: customers.id, name: customers.name }).from(customers).orderBy(asc(customers.name));
  const write = canWrite(user.role, "billing");
  const filtered = !!(q || status || customerId || sp.overdue);

  return (
    <>
      <PageHeader title="Sales invoices" subtitle="Tax invoices, payments and reminders"
        actions={write && <LinkButton href="/billing/invoices/new"><Plus className="h-4 w-4" aria-hidden /> New invoice</LinkButton>} />
      <BillingNav active="/billing/invoices" />
      <Flash ok={sp.ok} err={sp.err} />
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="search" aria-label="Filter invoices">
        <label className="sr-only" htmlFor="i-q">Search</label>
        <Input id="i-q" name="q" defaultValue={q} placeholder="Invoice no. / customer / PO" />
        <label className="sr-only" htmlFor="i-status">Status</label>
        <Select id="i-status" name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </Select>
        <label className="sr-only" htmlFor="i-cust">Customer</label>
        <Select id="i-cust" name="customer" defaultValue={customerId ? String(customerId) : ""}>
          <option value="">All customers</option>
          {custList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="overdue" value="1" defaultChecked={sp.overdue === "1"} className="h-4 w-4 accent-brand-600" /> Overdue only
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">Filter</Button>
          {filtered && <LinkButton href="/billing/invoices" variant="ghost">Clear</LinkButton>}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? "No invoices match these filters" : "No invoices yet"}
          action={write && !filtered ? <LinkButton href="/billing/invoices/new">Create an invoice</LinkButton> : undefined}>
          {filtered ? "Try clearing the filters." : "Raise invoices from delivered orders, or create a manual invoice."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr><Th>Invoice</Th><Th>Customer</Th><Th className="text-right">Total</Th><Th className="text-right">Outstanding</Th><Th>Due</Th><Th>Status</Th><Th className="text-right">Reminders</Th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const out = r.status === "cancelled" ? 0 : outstandingOf(r.total, r.paidAmount);
              const od = (OPEN_INVOICE_STATUSES as readonly string[]).includes(r.status) ? daysBetween(r.dueDate, today) : 0;
              return (
                <tr key={r.id} className="hover:bg-muted/50">
                  <Td>
                    <Link href={`/billing/invoices/${r.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.number}</Link>
                    <div className="text-xs text-ink-soft">{fmtDate(r.invoiceDate)}{r.orderNumber ? ` · ${r.orderNumber}` : ""}</div>
                  </Td>
                  <Td className="max-w-60 truncate"><Link href={`/billing/receivables/${r.customerId}`} className="hover:underline">{r.customerName ?? "-"}</Link></Td>
                  <Td className="text-right tabular-nums">{money(r.total)}</Td>
                  <Td className="text-right font-medium tabular-nums">{out > 0 ? money(out) : "-"}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(r.dueDate)}{od > 0 && <div><Badge tone="red">{od}d overdue</Badge></div>}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td className="text-right tabular-nums">{r.reminderCount || "-"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
