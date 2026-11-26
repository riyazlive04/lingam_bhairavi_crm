import Link from "next/link";
import { and, asc, count, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, projects, purchaseOrderLines, purchaseOrders, salesOrders, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, money, moneyShort, todayIST } from "@/lib/format";
import { PO_STATUSES, PO_STATUS_LABEL, isPoStatus } from "@/lib/purchase-orders";
import { Badge, Flash, LinkButton, Select, cx } from "@/components/ui";
import {
  Callout, FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, Pagination, ProgressBar, ResponsiveTable,
  type Column, type FilterPillItem,
} from "@/components/patterns";
import { PoStatusBadge } from "./_components/po-bits";
import { qs } from "@/lib/url";

export const metadata = { title: "Purchase orders" };

const PAGE_SIZE = 50;
type SP = { q?: string; status?: string; vendor?: string; so?: string; project?: string; page?: string; ok?: string; err?: string };
const posInt = (s?: string) => (s && /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null);

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("purchaseOrders");
  const sp = await searchParams;
  const db = await getDb();
  const write = canWrite(user.role, "purchaseOrders");
  const today = todayIST();

  const status = sp.status === "open" || sp.status === "overdue" || isPoStatus(sp.status) ? sp.status : "";
  const base: SQL[] = [];
  const vendorId = posInt(sp.vendor);
  if (vendorId) base.push(eq(purchaseOrders.vendorId, vendorId));
  const soId = posInt(sp.so);
  if (soId) base.push(eq(purchaseOrders.salesOrderId, soId));
  const projectId = posInt(sp.project);
  if (projectId) base.push(eq(purchaseOrders.projectId, projectId));
  if (sp.q?.trim()) {
    const like = `%${sp.q.trim()}%`;
    const c = or(ilike(purchaseOrders.number, like), ilike(vendors.name, like), ilike(salesOrders.number, like), ilike(salesOrders.customerPoNumber, like));
    if (c) base.push(c);
  }
  const statusCond = status === "open" ? inArray(purchaseOrders.status, ["sent", "partial"])
    : status === "overdue" ? and(inArray(purchaseOrders.status, ["sent", "partial"]), lt(purchaseOrders.expectedDate, today))
    : status ? eq(purchaseOrders.status, status) : undefined;
  const where = and(...base, statusCond);
  const page = Math.max(1, posInt(sp.page) ?? 1);

  const from = () => db.select({ n: count() }).from(purchaseOrders)
    .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId)).leftJoin(salesOrders, eq(salesOrders.id, purchaseOrders.salesOrderId));
  const [rows, [{ n }], [summary], byStatus, vendorList, projectList] = await Promise.all([
    db.select({ po: purchaseOrders, vendorName: vendors.name, soNumber: salesOrders.number, customerName: customers.name, projectCode: projects.code, projectName: projects.name })
      .from(purchaseOrders)
      .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
      .leftJoin(salesOrders, eq(salesOrders.id, purchaseOrders.salesOrderId))
      .leftJoin(customers, eq(customers.id, salesOrders.customerId))
      .leftJoin(projects, eq(projects.id, purchaseOrders.projectId))
      .where(where).orderBy(desc(purchaseOrders.poDate), desc(purchaseOrders.id))
      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    from().where(where),
    db.select({
      openValue: sql<number>`coalesce(sum(case when ${purchaseOrders.status} in ('sent','partial') then ${purchaseOrders.total} else 0 end),0)`.mapWith(Number),
      openN: sql<number>`count(*) filter (where ${purchaseOrders.status} in ('sent','partial'))`.mapWith(Number),
      overdueN: sql<number>`count(*) filter (where ${purchaseOrders.status} in ('sent','partial') and ${purchaseOrders.expectedDate} < ${today})`.mapWith(Number),
      drafts: sql<number>`count(*) filter (where ${purchaseOrders.status} = 'draft')`.mapWith(Number),
      monthValue: sql<number>`coalesce(sum(case when ${purchaseOrders.status} not in ('draft','cancelled') and ${purchaseOrders.poDate} >= ${today.slice(0, 7) + "-01"} then ${purchaseOrders.total} else 0 end),0)`.mapWith(Number),
    }).from(purchaseOrders),
    db.select({ status: purchaseOrders.status, n: count() }).from(purchaseOrders)
      .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId)).leftJoin(salesOrders, eq(salesOrders.id, purchaseOrders.salesOrderId))
      .where(and(...base)).groupBy(purchaseOrders.status),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(asc(vendors.name)),
    db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).orderBy(desc(projects.id)),
  ]);
  const ids = rows.map((r) => r.po.id);
  const recv = ids.length ? await db.select({
    poId: purchaseOrderLines.poId,
    ordered: sql<number>`coalesce(sum(${purchaseOrderLines.qty}),0)`.mapWith(Number),
    received: sql<number>`coalesce(sum(least(${purchaseOrderLines.receivedQty}, ${purchaseOrderLines.qty})),0)`.mapWith(Number),
  }).from(purchaseOrderLines).where(inArray(purchaseOrderLines.poId, ids)).groupBy(purchaseOrderLines.poId) : [];
  const pctOf = new Map(recv.map((r) => [r.poId, r.ordered > 0 ? (r.received / r.ordered) * 100 : 0]));
  const total = Number(n);
  const statusN = (s: string) => Number(byStatus.find((b) => b.status === s)?.n ?? 0);
  const allN = byStatus.reduce((a, b) => a + Number(b.n), 0);
  const filters = { q: sp.q, status, vendor: sp.vendor, so: sp.so, project: sp.project };
  const href = (patch: Partial<typeof filters & { page: number }>) => "/purchase-orders" + qs({ ...filters, ...patch });
  const showOrders = canRead(user.role, "orders");
  const showProjects = canRead(user.role, "projects");

  const activeFilters = [sp.q?.trim(), sp.vendor, sp.project, sp.so].filter(Boolean).length;
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "no", header: "PO", card: "title", nowrap: true,
      cell: ({ po }) => <Link href={`/purchase-orders/${po.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{po.number}</Link> },
    { key: "vendor", header: "Vendor", card: "subtitle", className: "max-w-56 truncate", cell: (r) => r.vendorName ?? "-" },
    { key: "date", header: "Date", nowrap: true,
      cell: ({ po }) => {
        const live = po.status === "sent" || po.status === "partial";
        const late = live && po.expectedDate != null && po.expectedDate < today;
        return (
          <>
            {fmtDate(po.poDate)}
            {po.expectedDate && <div className={cx("text-caption", late ? "font-medium text-danger" : "text-ink-soft")}>Due {fmtDate(po.expectedDate)}{late ? ", late" : ""}</div>}
          </>
        );
      } },
    { key: "for", header: "For", className: "max-w-60 whitespace-normal",
      cell: ({ po, soNumber, customerName, projectCode, projectName }) => (
        <>
          {soNumber ? (
            <div>{showOrders ? <Link href={`/orders/${po.salesOrderId}`} className="relative z-[1] hover:underline">{soNumber}</Link> : soNumber}
              {customerName && <span className="text-caption text-ink-soft"> · {customerName}</span>}</div>
          ) : null}
          {projectCode && <div title={projectName ?? undefined}>{showProjects ? <Link href={`/projects/${po.projectId}`} className="relative z-[1]"><Badge tone="violet">{projectCode}</Badge></Link> : <Badge tone="violet">{projectCode}</Badge>}</div>}
          {!soNumber && !projectCode && <span className="text-ink-faint">Stock</span>}
        </>
      ) },
    { key: "status", header: "Status", card: "badge", cell: ({ po }) => <PoStatusBadge status={po.status} /> },
    { key: "value", header: "Value", align: "right", card: "amount", nowrap: true, cell: ({ po }) => money(po.total) },
    { key: "recv", header: "Received", priority: 3,
      cell: ({ po }) => po.status === "draft" || po.status === "cancelled" ? <span className="text-ink-faint">-</span> : <ProgressBar size="sm" label="Received" value={pctOf.get(po.id) ?? 0} /> },
  ];
  const pills: FilterPillItem[] = [
    { label: "All", href: href({ status: undefined, page: undefined }), active: !status, count: allN },
    { label: "Open", href: href({ status: "open", page: undefined }), active: status === "open", count: statusN("sent") + statusN("partial") },
    { label: "Overdue", href: href({ status: "overdue", page: undefined }), active: status === "overdue", count: summary.overdueN, attention: summary.overdueN > 0 },
    ...PO_STATUSES.map((s) => ({ label: PO_STATUS_LABEL[s], href: href({ status: s, page: undefined }), active: status === s, count: statusN(s) })),
  ];
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ListPage
      title="Purchase orders"
      subtitle="Orders placed with vendors, often against a customer's purchase order. Bills raised from a PO update what has been received."
      primaryAction={write && <LinkButton href="/purchase-orders/new"><Plus className="icon-sm" aria-hidden /> New PO</LinkButton>}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {soId && (
            <Callout tone="info" action={<LinkButton href={href({ so: undefined, page: undefined })} variant="secondary" size="sm">Show all POs</LinkButton>}>
              Showing POs for one customer order.
            </Callout>
          )}
        </>
      }
      stats={
        <MetricStrip>
          <Metric label="Open with vendors" value={moneyShort(summary.openValue)} hint={`${summary.openN} PO${summary.openN === 1 ? "" : "s"} awaiting material`} href={href({ status: "open", page: undefined })} />
          <Metric label="Overdue deliveries" value={summary.overdueN} tone={summary.overdueN > 0 ? "bad" : "default"} hint="Past the expected date" href={href({ status: "overdue", page: undefined })} />
          <Metric label="Ordered this month" value={moneyShort(summary.monthValue)} />
          <Metric label="Drafts to send" value={summary.drafts} tone={summary.drafts > 0 ? "warn" : "default"} href={href({ status: "draft", page: undefined })} />
        </MetricStrip>
      }
      filters={
        <>
          <FilterPills label="Filter by status" items={pills} />
          <ListFilters q={sp.q} placeholder="Search PO no., vendor, customer order" clearHref={href({ q: undefined, vendor: undefined, project: undefined, so: undefined, page: undefined })}
            activeCount={activeFilters} hidden={{ status, so: soId }}>
            <Select name="vendor" defaultValue={sp.vendor ?? ""} aria-label="Vendor">
              <option value="">All vendors</option>
              {vendorList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            <Select name="project" defaultValue={sp.project ?? ""} aria-label="Project">
              <option value="">All projects</option>
              {projectList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </ListFilters>
        </>
      }
      isEmpty={rows.length === 0}
      empty={
        <ListEmpty filtered={Object.values(filters).some(Boolean)} noun="purchase orders" clearHref="/purchase-orders"
          action={write && <LinkButton href="/purchase-orders/new"><Plus className="icon-sm" aria-hidden /> Raise a purchase order</LinkButton>}>
          Raise a PO to a vendor, or open a customer order and use Create vendor PO to buy its pending lines.
        </ListEmpty>
      }
      resultSummary={`${total} purchase order${total === 1 ? "" : "s"}`}
      pagination={<Pagination page={page} pages={pages} total={total} noun="purchase orders" href={(p) => href({ page: p })} />}
    >
      <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.po.id} caption="Purchase orders" />
    </ListPage>
  );
}
