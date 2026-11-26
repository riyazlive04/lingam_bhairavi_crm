import Link from "next/link";
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { customerOutstanding } from "@/lib/billing";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { money, todayIST } from "@/lib/format";
import { Badge, Flash, LinkButton, Select, cx } from "@/components/ui";
import {
  FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, Pagination, ResponsiveTable, StatusPill,
  type Column, type FilterPillItem,
} from "@/components/patterns";
import { CUSTOMER_TYPES } from "./_components/customer-form";

export const metadata = { title: "Customers" };

const PAGE_SIZE = 100;
type SP = { q?: string; type?: string; status?: string; due?: string; page?: string; ok?: string; err?: string };
const TYPE_TONE = { customer: "blue", consultant: "violet", builder: "amber" } as const;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("customers");
  const sp = await searchParams;
  const db = await getDb();
  const write = canWrite(user.role, "customers");
  const today = todayIST();
  const type = sp.type && sp.type in CUSTOMER_TYPES ? sp.type : "";

  // same figures as Billing > Receivables: net due = invoices due − unadjusted credit notes − unapplied advances (rules 13, 15)
  const recv = await customerOutstanding(db, today);
  const recvBy = new Map(recv.map((r) => [r.partyId, { outstanding: r.invoicesDue, netDue: r.netDue, overdue: r.overdue }]));

  const conds: (SQL | undefined)[] = [];
  if (sp.status !== "all") conds.push(eq(customers.active, sp.status !== "inactive"));
  if (type) conds.push(eq(customers.type, type));
  if (sp.q) {
    const like = `%${sp.q.trim()}%`;
    conds.push(or(ilike(customers.name, like), ilike(customers.city, like), ilike(customers.contactPerson, like), ilike(customers.phone, like), ilike(customers.gstin, like)));
  }
  if (sp.due === "1") {
    const ids = [...recvBy.entries()].filter(([, r]) => r.outstanding > 0.5 || Math.abs(r.netDue) > 0.5).map(([id]) => id);
    conds.push(ids.length ? inArray(customers.id, ids) : sql`false`);
  }
  const all = await db.select().from(customers).where(and(...conds)).orderBy(asc(customers.name));
  const page = Math.max(1, Number(sp.page) || 1);
  const pages = Math.ceil(all.length / PAGE_SIZE);
  const list = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalOut = [...recvBy.values()].reduce((s, r) => s + r.outstanding, 0);
  const totalNet = [...recvBy.values()].reduce((s, r) => s + r.netDue, 0);
  const totalOverdue = [...recvBy.values()].reduce((s, r) => s + r.overdue, 0);

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, type, status: sp.status, due: sp.due, page: sp.page, ...patch })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/customers?${s}` : "/customers";
  };
  const activeFilters = [sp.q?.trim(), type, sp.due === "1" ? "1" : ""].filter(Boolean).length;
  const filtered = activeFilters > 0 || (!!sp.status && sp.status !== "");

  const statusPills: FilterPillItem[] = [
    { label: "Active", href: qs({ status: undefined, page: undefined }), active: !sp.status || (sp.status !== "inactive" && sp.status !== "all") },
    { label: "Inactive", href: qs({ status: "inactive", page: undefined }), active: sp.status === "inactive" },
    { label: "All", href: qs({ status: "all", page: undefined }), active: sp.status === "all" },
  ];

  type Row = (typeof list)[number];
  const columns: Column<Row>[] = [
    {
      key: "name", header: "Customer", card: "title",
      cell: (c) => (
        <>
          <Link href={`/customers/${c.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{c.name}</Link>
          {!c.active && <> <StatusPill semantic="neutral" label="Inactive" noDot /></>}
        </>
      ),
    },
    {
      key: "type", header: "Type", card: "badge",
      cell: (c) => <Badge tone={TYPE_TONE[c.type as keyof typeof TYPE_TONE] ?? "gray"}>{CUSTOMER_TYPES[c.type as keyof typeof CUSTOMER_TYPES] ?? c.type}</Badge>,
    },
    { key: "city", header: "City", card: "subtitle", cell: (c) => c.city ?? "-" },
    {
      key: "contact", header: "Contact", priority: 3,
      cell: (c) => (
        <span className="text-caption">
          {c.contactPerson ?? "-"}
          {c.phone && <span className="block"><a href={`tel:${c.phone}`} className="text-ink-soft hover:underline">{c.phone}</a></span>}
        </span>
      ),
    },
    {
      key: "out", header: "Invoices due", align: "right", nowrap: true,
      cell: (c) => {
        const r = recvBy.get(c.id);
        const overLimit = c.creditLimit > 0 && (r?.outstanding ?? 0) > c.creditLimit;
        if (!r || r.outstanding <= 0.5) return <span className="text-ink-faint">-</span>;
        return <span className={cx(overLimit && "font-semibold text-danger")} title={overLimit ? "Over credit limit" : undefined}>{money(r.outstanding)}{overLimit && <span className="sr-only"> (over credit limit)</span>}</span>;
      },
    },
    {
      key: "net", header: "Net due", align: "right", card: "amount", nowrap: true,
      cell: (c) => {
        const r = recvBy.get(c.id);
        if (!r || Math.abs(r.netDue) <= 0.5) return <span className="text-ink-faint">-</span>;
        return <span className={cx(r.netDue < -0.5 && "text-success")} title={r.netDue < -0.5 ? "Customer is in credit" : undefined}>{money(r.netDue)}</span>;
      },
    },
    {
      key: "overdue", header: "Overdue", align: "right", nowrap: true,
      cell: (c) => {
        const r = recvBy.get(c.id);
        return r && r.overdue > 0.5 ? <span className="font-medium text-danger">{money(r.overdue)}</span> : <span className="text-ink-faint">-</span>;
      },
    },
  ];

  return (
    <ListPage
      title="Customers"
      subtitle="Customers, consultants and builders, with their quotations, orders, invoices and refill assets."
      primaryAction={write && <LinkButton href="/customers/new"><Plus className="icon-sm" aria-hidden /> New customer</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={
        <MetricStrip>
          <Metric label="Customers" value={all.length} />
          <Metric label="Invoices due" value={money(totalOut)} href={qs({ due: "1", page: undefined })} />
          <Metric label="Net due" value={money(totalNet)} hint="After credit notes and advances" />
          <Metric label="Overdue" value={money(totalOverdue)} tone={totalOverdue > 0 ? "bad" : "default"} />
        </MetricStrip>
      }
      filters={
        <>
          <FilterPills label="Filter by status" items={statusPills} />
          <ListFilters q={sp.q} placeholder="Search name, city, phone, GSTIN" clearHref={qs({ q: undefined, type: undefined, due: undefined, page: undefined })}
            activeCount={activeFilters} hidden={{ status: sp.status }}>
            <Select name="type" defaultValue={type} aria-label="Type">
              <option value="">All types</option>
              {Object.entries(CUSTOMER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <label className="flex h-9.5 items-center gap-2 rounded-lg px-1 text-sm whitespace-nowrap text-ink-soft">
              <input type="checkbox" name="due" value="1" defaultChecked={sp.due === "1"} className="icon-sm accent-brand-600" /> With dues only
            </label>
          </ListFilters>
        </>
      }
      isEmpty={list.length === 0}
      empty={
        <ListEmpty filtered={filtered} noun="customers" clearHref="/customers"
          action={write && <LinkButton href="/customers/new"><Plus className="icon-sm" aria-hidden /> Add the first customer</LinkButton>}>
          Add a customer to start quoting, or they appear here once you create a quotation for them.
        </ListEmpty>
      }
      resultSummary={`${all.length} customer${all.length === 1 ? "" : "s"}`}
      pagination={<Pagination page={page} pages={pages} total={all.length} noun="customers" href={(p) => qs({ page: String(p) })} />}
    >
      <ResponsiveTable rows={list} columns={columns} rowKey={(c) => c.id} caption="Customers" />
    </ListPage>
  );
}
