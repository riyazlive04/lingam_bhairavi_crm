import Link from "next/link";
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, salesInvoices } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { money, todayIST } from "@/lib/format";
import { Badge, EmptyState, FilterBar, Flash, LinkButton, PageHeader, Select, Stat, Table, Td, Th, cx } from "@/components/ui";
import { CUSTOMER_TYPES } from "./_components/customer-form";
import { Pager, qs } from "../items/_components/tabs";

const PAGE_SIZE = 100;
/** Sales-invoice statuses that carry a receivable. */
const OPEN_SI_STATUSES = ["issued", "partially_paid"];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; status?: string; due?: string; page?: string; ok?: string; err?: string }> }) {
  const user = await requireUser("customers");
  const sp = await searchParams;
  const db = await getDb();
  const write = canWrite(user.role, "customers");
  const today = todayIST();
  const type = sp.type && sp.type in CUSTOMER_TYPES ? sp.type : "";

  const recv = await db.select({
    customerId: salesInvoices.customerId,
    outstanding: sql<number>`coalesce(sum(${salesInvoices.total} - ${salesInvoices.paidAmount}),0)`.mapWith(Number),
    overdue: sql<number>`coalesce(sum(case when ${salesInvoices.dueDate} < ${today} then ${salesInvoices.total} - ${salesInvoices.paidAmount} else 0 end),0)`.mapWith(Number),
  }).from(salesInvoices).where(inArray(salesInvoices.status, OPEN_SI_STATUSES)).groupBy(salesInvoices.customerId);
  const recvBy = new Map(recv.map((r) => [r.customerId, { outstanding: Math.max(0, Number(r.outstanding)), overdue: Math.max(0, Number(r.overdue)) }]));

  const conds: (SQL | undefined)[] = [];
  if (sp.status !== "all") conds.push(eq(customers.active, sp.status !== "inactive"));
  if (type) conds.push(eq(customers.type, type));
  if (sp.q) {
    const like = `%${sp.q.trim()}%`;
    conds.push(or(ilike(customers.name, like), ilike(customers.city, like), ilike(customers.contactPerson, like), ilike(customers.phone, like), ilike(customers.gstin, like)));
  }
  if (sp.due === "1") {
    const ids = [...recvBy.entries()].filter(([, r]) => r.outstanding > 0.5).map(([id]) => id);
    conds.push(ids.length ? inArray(customers.id, ids) : sql`false`);
  }
  const all = await db.select().from(customers).where(and(...conds)).orderBy(asc(customers.name));
  const page = Math.max(1, Number(sp.page) || 1);
  const pages = Math.ceil(all.length / PAGE_SIZE);
  const list = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalOut = [...recvBy.values()].reduce((s, r) => s + r.outstanding, 0);
  const totalOverdue = [...recvBy.values()].reduce((s, r) => s + r.overdue, 0);

  return (
    <div>
      <PageHeader title="Customers" subtitle="Customers, consultants and builders — with quotations, orders, invoices and refill assets."
        actions={write && <LinkButton href="/customers/new"><Plus size={16} aria-hidden /> New customer</LinkButton>} />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Customers" value={all.length} />
        <Stat label="Outstanding receivable" value={money(totalOut)} href={"/customers" + qs({ due: 1 })} />
        <Stat label="Overdue" value={money(totalOverdue)} tone={totalOverdue > 0 ? "bad" : "default"} />
      </div>
      <FilterBar q={sp.q} placeholder="Search name, city, phone, GSTIN…">
        <label className="sm:w-44"><span className="sr-only">Type</span>
          <Select name="type" defaultValue={type}>
            <option value="">All types</option>
            {Object.entries(CUSTOMER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </label>
        <label className="sm:w-40"><span className="sr-only">Status</span>
          <Select name="status" defaultValue={sp.status ?? ""}>
            <option value="">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
          </Select>
        </label>
        <label className="flex items-center gap-1.5 text-sm text-ink-soft whitespace-nowrap">
          <input type="checkbox" name="due" value="1" defaultChecked={sp.due === "1"} className="h-4 w-4 accent-brand-600" /> With dues
        </label>
      </FilterBar>
      {list.length === 0 ? (
        <EmptyState title="No customers found" action={write && <LinkButton href="/customers/new">Add a customer</LinkButton>}>Try clearing the filters.</EmptyState>
      ) : (
        <>
          <Table>
            <thead><tr><Th>Customer</Th><Th>Type</Th><Th>City</Th><Th>Contact</Th><Th className="text-right">Outstanding</Th><Th className="text-right">Overdue</Th></tr></thead>
            <tbody>
              {list.map((c) => {
                const r = recvBy.get(c.id);
                const overLimit = c.creditLimit > 0 && (r?.outstanding ?? 0) > c.creditLimit;
                return (
                  <tr key={c.id} className="hover:bg-muted/50">
                    <Td><Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{c.name}</Link>{!c.active && <> <Badge>inactive</Badge></>}</Td>
                    <Td><Badge tone={c.type === "customer" ? "blue" : c.type === "consultant" ? "violet" : "amber"}>{CUSTOMER_TYPES[c.type as keyof typeof CUSTOMER_TYPES] ?? c.type}</Badge></Td>
                    <Td>{c.city ?? "—"}</Td>
                    <Td className="text-xs">{c.contactPerson ?? "—"}{c.phone && <div><a href={`tel:${c.phone}`} className="text-ink-soft hover:underline">{c.phone}</a></div>}</Td>
                    <Td className={cx("text-right tabular-nums", overLimit && "font-semibold text-red-600")} title={overLimit ? "Over credit limit" : undefined}>
                      {r && r.outstanding > 0.5 ? money(r.outstanding) : <span className="text-ink-faint">—</span>}</Td>
                    <Td className="text-right tabular-nums">{r && r.overdue > 0.5 ? <span className="font-medium text-red-600">{money(r.overdue)}</span> : <span className="text-ink-faint">—</span>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pager page={page} pages={pages} href={(p) => "/customers" + qs({ q: sp.q, type, status: sp.status, due: sp.due, page: p })} />
        </>
      )}
    </div>
  );
}
