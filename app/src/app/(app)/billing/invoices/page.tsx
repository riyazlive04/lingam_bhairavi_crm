import Link from "next/link";
import { and, asc, desc, eq, ilike, inArray, lt, or, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, salesInvoices, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { daysBetween, fmtDate, money, todayIST } from "@/lib/format";
import { OPEN_INVOICE_STATUSES, outstandingOf } from "@/lib/billing";
import { Flash, LinkButton, Select } from "@/components/ui";
import { FilterPills, ListEmpty, ListFilters, ListPage, ResponsiveTable, StatusPill, statusLabel, type Column, type FilterPillItem } from "@/components/patterns";
import { BillingTabs } from "../_components/billing-tabs";

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

  const overdueOnly = sp.overdue === "1";
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status, customer: customerId ? String(customerId) : undefined, overdue: overdueOnly ? "1" : undefined, ...patch })) if (v) p.set(k, v);
    const str = p.toString();
    return str ? `/billing/invoices?${str}` : "/billing/invoices";
  };
  const pills: FilterPillItem[] = [
    { label: "All", href: qs({ status: undefined, overdue: undefined }), active: !status && !overdueOnly },
    ...STATUSES.map((st) => ({ label: statusLabel(st), href: qs({ status: st, overdue: undefined }), active: status === st && !overdueOnly })),
    { label: "Overdue", href: qs({ status: undefined, overdue: overdueOnly ? undefined : "1" }), active: overdueOnly, attention: !overdueOnly },
  ];

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "no", header: "Invoice", card: "title", nowrap: true,
      cell: (r) => (
        <>
          <Link href={`/billing/invoices/${r.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.number}</Link>
          <div className="text-caption font-normal text-ink-soft">{fmtDate(r.invoiceDate)}{r.orderNumber ? ` · ${r.orderNumber}` : ""}</div>
        </>
      ) },
    { key: "customer", header: "Customer", card: "subtitle", className: "max-w-60 truncate",
      cell: (r) => <Link href={`/billing/receivables/${r.customerId}`} className="relative z-[1] hover:underline">{r.customerName ?? "-"}</Link> },
    { key: "total", header: "Total", align: "right", nowrap: true, cell: (r) => money(r.total) },
    { key: "out", header: "Outstanding", align: "right", card: "amount", nowrap: true,
      cell: (r) => {
        const out = r.status === "cancelled" ? 0 : outstandingOf(r.total, r.paidAmount);
        return <span className="font-medium">{out > 0 ? money(out) : "-"}</span>;
      } },
    { key: "due", header: "Due", nowrap: true,
      cell: (r) => {
        const od = (OPEN_INVOICE_STATUSES as readonly string[]).includes(r.status) ? daysBetween(r.dueDate, today) : 0;
        return <>{fmtDate(r.dueDate)}{od > 0 && <div className="mt-0.5"><StatusPill status="overdue" label={`${od} days overdue`} /></div>}</>;
      } },
    { key: "status", header: "Status", card: "badge", cell: (r) => <StatusPill status={r.status} /> },
    { key: "rem", header: "Reminders", align: "right", priority: 3, cell: (r) => r.reminderCount || "-" },
  ];

  return (
    <ListPage
      title="Sales invoices"
      subtitle="Tax invoices, payments and reminders."
      primaryAction={write && <LinkButton href="/billing/invoices/new"><Plus className="icon-sm" aria-hidden /> New invoice</LinkButton>}
      tabs={<BillingTabs active="invoices" />}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      filters={
        <>
          <FilterPills label="Filter by status" items={pills} />
          <ListFilters q={q} placeholder="Search invoice no., customer, PO" clearHref={qs({ q: undefined, customer: undefined })}
            activeCount={[q, customerId].filter(Boolean).length} hidden={{ status, overdue: overdueOnly ? "1" : undefined }}>
            <Select name="customer" defaultValue={customerId ? String(customerId) : ""} aria-label="Customer">
              <option value="">All customers</option>
              {custList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </ListFilters>
        </>
      }
      isEmpty={rows.length === 0}
      empty={
        <ListEmpty filtered={filtered} noun="invoices" clearHref="/billing/invoices"
          action={write && <LinkButton href="/billing/invoices/new"><Plus className="icon-sm" aria-hidden /> Create an invoice</LinkButton>}>
          Raise invoices from delivered orders, or create a manual invoice.
        </ListEmpty>
      }
      resultSummary={rows.length >= 300 ? "Showing the latest 300 invoices. Search or filter to narrow down." : `${rows.length} invoice${rows.length === 1 ? "" : "s"}`}
    >
      <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Sales invoices" />
    </ListPage>
  );
}
