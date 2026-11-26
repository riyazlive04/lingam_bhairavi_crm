import Link from "next/link";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { AlertTriangle, FileSpreadsheet, Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, quotations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { QUOTE_STATUSES, SYSTEMS, type SystemKey } from "@/lib/constants";
import { daysBetween, fmtDate, money, moneyShort, pct, todayIST } from "@/lib/format";
import { EDITABLE_QUOTE_STATUSES, istDate } from "@/lib/quotations";
import { EmptyState, Flash, Input, LinkButton, Select } from "@/components/ui";
import {
  FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, Pagination, ResponsiveTable, StatusPill, statusLabel,
  type Column, type FilterPillItem,
} from "@/components/patterns";

/**
 * REFERENCE LIST PAGE (design system v2). Module teams copy this structure:
 * ListPage > notices, MetricStrip, FilterPills + ListFilters, ResponsiveTable, Pagination, ListEmpty.
 */
export const metadata = { title: "Quotations" };

type SP = {
  q?: string; status?: string; system?: string; customer?: string; sp?: string; from?: string; to?: string; page?: string; ok?: string; err?: string;
  /** "pending" = only quotations awaiting an admin's approval (rule 11) */
  approval?: string;
};
const PAGE = 50;
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const posInt = (s?: string) => (s && /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null);

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("quotations");
  const db = await getDb();
  const sp = await searchParams;
  const writable = canWrite(user.role, "quotations");
  const today = todayIST();

  // filters (all except status → used for pipeline stats too)
  const base: SQL[] = [];
  if (sp.system && sp.system in SYSTEMS) base.push(eq(quotations.system, sp.system));
  const custId = posInt(sp.customer);
  if (custId) base.push(eq(quotations.customerId, custId));
  const spId = posInt(sp.sp);
  if (spId) base.push(eq(quotations.preparedBy, spId));
  if (isDate(sp.from)) base.push(gte(quotations.quoteDate, sp.from!));
  if (isDate(sp.to)) base.push(lte(quotations.quoteDate, sp.to!));
  if (sp.q?.trim()) {
    const like = `%${sp.q.trim()}%`;
    const c = or(ilike(quotations.number, like), ilike(quotations.projectName, like), ilike(customers.name, like), ilike(quotations.siteLocation, like));
    if (c) base.push(c);
  }
  const status = sp.status && (QUOTE_STATUSES as readonly string[]).includes(sp.status) ? sp.status : null;
  const awaiting = sp.approval === "pending";
  const pendingCond = and(eq(quotations.approvalStatus, "pending"), inArray(quotations.status, [...EDITABLE_QUOTE_STATUSES]));
  const where = and(...base, ...(status ? [eq(quotations.status, status)] : []), ...(awaiting ? [pendingCond] : []));
  const page = Math.max(1, posInt(sp.page) ?? 1);

  const [rows, [{ total }], byStatus, closedWon, custs, salespeople, [{ awaitingN }]] = await Promise.all([
    db.select({
      id: quotations.id, number: quotations.number, revision: quotations.revision, status: quotations.status, quoteDate: quotations.quoteDate,
      validUntil: quotations.validUntil, projectName: quotations.projectName, system: quotations.system, grandTotal: quotations.grandTotal,
      nextFollowUpDate: quotations.nextFollowUpDate, customerName: customers.name, preparedBy: users.name, approvalStatus: quotations.approvalStatus,
    })
      .from(quotations)
      .leftJoin(customers, eq(customers.id, quotations.customerId))
      .leftJoin(users, eq(users.id, quotations.preparedBy))
      .where(where)
      .orderBy(desc(quotations.quoteDate), desc(quotations.id))
      .limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: count() }).from(quotations).leftJoin(customers, eq(customers.id, quotations.customerId)).where(where),
    db.select({
      status: quotations.status, n: count(),
      value: sql<number>`coalesce(sum(${quotations.grandTotal}),0)`.mapWith(Number),
    }).from(quotations).leftJoin(customers, eq(customers.id, quotations.customerId)).where(and(...base)).groupBy(quotations.status),
    db.select({ quoteDate: quotations.quoteDate, closedAt: quotations.closedAt }).from(quotations)
      .leftJoin(customers, eq(customers.id, quotations.customerId)).where(and(...base, eq(quotations.status, "won"))),
    db.select({ id: customers.id, name: customers.name }).from(customers).orderBy(asc(customers.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(or(eq(users.role, "sales"), eq(users.role, "admin"))).orderBy(asc(users.name)),
    db.select({ awaitingN: count() }).from(quotations).leftJoin(customers, eq(customers.id, quotations.customerId)).where(and(...base, pendingCond)),
  ]);

  const stat = (s: string) => byStatus.find((b) => b.status === s) ?? { n: 0, value: 0 };
  const won = Number(stat("won").n), lost = Number(stat("lost").n);
  const conversion = won + lost > 0 ? (won / (won + lost)) * 100 : null;
  const closeDays = closedWon.filter((c) => c.closedAt).map((c) => daysBetween(c.quoteDate, istDate(c.closedAt!)));
  const avgClose = closeDays.length ? closeDays.reduce((a, b) => a + b, 0) / closeDays.length : null;
  const openN = Number(stat("sent").n) + Number(stat("negotiation").n);
  const openV = stat("sent").value + stat("negotiation").value;
  const totalN = Number(total);
  const pages = Math.max(1, Math.ceil(totalN / PAGE));
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ok: undefined, err: undefined, ...patch })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/quotations?${s}` : "/quotations";
  };
  // Search and select filters only (status pills are counted separately).
  const activeFilters = [sp.q?.trim(), sp.system, sp.customer, sp.sp, sp.from, sp.to].filter(Boolean).length;
  const editable = (s: string) => (EDITABLE_QUOTE_STATUSES as readonly string[]).includes(s);

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "number", header: "Quotation", card: "title", nowrap: true,
      cell: (r) => (
        <>
          <Link href={`/quotations/${r.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.number}</Link>
          {r.system && <div className="text-caption font-normal text-ink-soft">{SYSTEMS[r.system as SystemKey] ?? r.system}</div>}
        </>
      ),
    },
    {
      key: "customer", header: "Customer / project", card: "subtitle", className: "max-w-xs whitespace-normal",
      cell: (r) => (
        <>
          <div className="font-medium text-ink">{r.customerName ?? "-"}</div>
          {r.projectName && <div className="truncate text-caption text-ink-soft">{r.projectName}</div>}
        </>
      ),
    },
    { key: "date", header: "Date", nowrap: true, cell: (r) => fmtDate(r.quoteDate) },
    {
      key: "status", header: "Status", card: "badge",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1 max-sm:items-end">
          <StatusPill status={r.status} />
          {r.approvalStatus === "pending" && editable(r.status) && <StatusPill semantic="warning" label="Awaiting approval" noDot />}
          {r.approvalStatus === "rejected" && editable(r.status) && <StatusPill semantic="danger" label="Not approved" noDot />}
        </div>
      ),
    },
    { key: "value", header: "Value (incl. GST)", align: "right", card: "amount", nowrap: true, cell: (r) => money(r.grandTotal) },
    {
      key: "followup", header: "Next follow-up", nowrap: true,
      cell: (r) => {
        const open = r.status === "sent" || r.status === "negotiation";
        if (!open) return "-";
        if (!r.nextFollowUpDate) return <span className="text-warning">Not set</span>;
        const overdue = r.nextFollowUpDate < today;
        return overdue
          ? <span className="inline-flex items-center gap-1 font-medium text-danger"><AlertTriangle className="icon-xs" aria-hidden />{fmtDate(r.nextFollowUpDate)}<span className="sr-only"> (overdue)</span></span>
          : fmtDate(r.nextFollowUpDate);
      },
    },
    { key: "by", header: "Prepared by", priority: 3, nowrap: true, className: "text-ink-soft", cell: (r) => r.preparedBy ?? "-" },
  ];

  const allN = byStatus.reduce((s, b) => s + Number(b.n), 0);
  const pills: FilterPillItem[] = [
    { label: "All", href: qs({ status: undefined, approval: undefined, page: undefined }), active: !status && !awaiting, count: allN },
    {
      label: "Awaiting approval", href: qs({ status: undefined, approval: awaiting ? undefined : "pending", page: undefined }),
      active: awaiting, count: Number(awaitingN), attention: Number(awaitingN) > 0,
    },
    ...QUOTE_STATUSES.map((s) => ({
      label: statusLabel(s), href: qs({ status: s, approval: undefined, page: undefined }), active: status === s && !awaiting,
      count: Number(stat(s).n), hint: stat(s).value > 0 ? moneyShort(stat(s).value) : undefined,
    })),
  ];

  return (
    <ListPage
      title="Quotations"
      subtitle="Standard BOQ based quotations, priced from the latest purchase cost."
      secondaryActions={writable && <LinkButton href="/boq-import" variant="secondary"><FileSpreadsheet className="icon-sm" aria-hidden /> Import consultant BOQ</LinkButton>}
      primaryAction={writable && <LinkButton href="/quotations/new"><Plus className="icon-sm" aria-hidden /> New quotation</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={
        <MetricStrip>
          <Metric label="Open pipeline" value={moneyShort(openV)} hint={`${openN} sent or in negotiation`} href={qs({ status: "sent", page: undefined })} />
          <Metric label="Won" value={moneyShort(stat("won").value)} hint={`${won} quotation${won === 1 ? "" : "s"}`} tone="good" href={qs({ status: "won", page: undefined })} />
          <Metric label="Conversion" value={conversion == null ? "-" : pct(conversion, 0)} hint={`Won out of won plus lost · ${lost} lost`} tone={conversion != null && conversion < 25 ? "warn" : "default"} />
          <Metric label="Average days to close" value={avgClose == null ? "-" : Math.round(avgClose)} hint="From quote date to won" />
        </MetricStrip>
      }
      filters={
        <>
          <FilterPills label="Filter by status" items={pills} />
          <ListFilters q={sp.q} placeholder="Search number, customer, project" clearHref={qs({ q: undefined, system: undefined, customer: undefined, sp: undefined, from: undefined, to: undefined, page: undefined })}
            activeCount={activeFilters} hidden={{ status, approval: awaiting ? "pending" : undefined }}>
            <Select name="system" defaultValue={sp.system ?? ""} aria-label="System">
              <option value="">All systems</option>
              {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select name="customer" defaultValue={sp.customer ?? ""} aria-label="Customer">
              <option value="">All customers</option>
              {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select name="sp" defaultValue={sp.sp ?? ""} aria-label="Salesperson">
              <option value="">All salespeople</option>
              {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Input type="date" name="from" defaultValue={sp.from} aria-label="From date" title="From date" />
            <Input type="date" name="to" defaultValue={sp.to} aria-label="To date" title="To date" />
          </ListFilters>
        </>
      }
      isEmpty={rows.length === 0}
      empty={awaiting
        ? <EmptyState title="Nothing is waiting for approval">Quotations that need an owner&apos;s approval before sending show up here.</EmptyState>
        : (
          <ListEmpty filtered={base.length > 0 || !!status} noun="quotations" clearHref="/quotations"
            action={writable && <LinkButton href="/quotations/new"><Plus className="icon-sm" aria-hidden /> Create the first quotation</LinkButton>}>
            Pick a standard BOQ, enter quantities and the latest prices are filled in for you.
          </ListEmpty>
        )}
      resultSummary={`${totalN} quotation${totalN === 1 ? "" : "s"}`}
      pagination={<Pagination page={page} pages={pages} total={totalN} noun="quotations" href={(p) => qs({ page: String(p) })} />}
    >
      <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Quotations" />
    </ListPage>
  );
}
