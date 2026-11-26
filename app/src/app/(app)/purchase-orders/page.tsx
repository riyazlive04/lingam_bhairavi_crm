import Link from "next/link";
import { and, asc, count, desc, eq, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, projects, purchaseOrderLines, purchaseOrders, salesOrders, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, money, moneyShort, todayIST } from "@/lib/format";
import { PO_STATUSES, PO_STATUS_LABEL, isPoStatus } from "@/lib/purchase-orders";
import { Badge, Button, EmptyState, Flash, Input, LinkButton, PageHeader, Select, Stat, Table, Td, Th, cx } from "@/components/ui";
import { Pager, qs } from "../items/_components/tabs";
import { PoStatusBadge, ReceivedBar } from "./_components/po-bits";

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

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        subtitle="Orders placed with vendors, often against a customer's purchase order. Bills raised from a PO update what has been received."
        actions={write && <LinkButton href="/purchase-orders/new"><Plus size={16} aria-hidden /> New PO</LinkButton>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open with vendors" value={moneyShort(summary.openValue)} hint={`${summary.openN} PO${summary.openN === 1 ? "" : "s"} awaiting material`} href={href({ status: "open", page: undefined })} />
        <Stat label="Overdue deliveries" value={summary.overdueN} tone={summary.overdueN > 0 ? "bad" : "default"} hint="Past the expected date" href={href({ status: "overdue", page: undefined })} />
        <Stat label="Ordered this month" value={moneyShort(summary.monthValue)} />
        <Stat label="Drafts to send" value={summary.drafts} tone={summary.drafts > 0 ? "warn" : "default"} href={href({ status: "draft", page: undefined })} />
      </div>

      <nav aria-label="Filter by status" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Pill href={href({ status: undefined, page: undefined })} active={!status} label="All" n={allN} />
        <Pill href={href({ status: "open", page: undefined })} active={status === "open"} label="Open" n={statusN("sent") + statusN("partial")} />
        {PO_STATUSES.map((s) => <Pill key={s} href={href({ status: s, page: undefined })} active={status === s} label={PO_STATUS_LABEL[s]} n={statusN(s)} />)}
      </nav>

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {status && <input type="hidden" name="status" value={status} />}
        {soId && <input type="hidden" name="so" value={soId} />}
        <label className="lg:col-span-2"><span className="sr-only">Search</span><Input name="q" defaultValue={sp.q} placeholder="PO no., vendor, customer order…" /></label>
        <label><span className="sr-only">Vendor</span>
          <Select name="vendor" defaultValue={sp.vendor ?? ""}>
            <option value="">All vendors</option>
            {vendorList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </label>
        <label><span className="sr-only">Project</span>
          <Select name="project" defaultValue={sp.project ?? ""}>
            <option value="">All projects</option>
            {projectList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">Filter</Button>
          {Object.values(filters).some(Boolean) && <LinkButton href="/purchase-orders" variant="ghost">Clear</LinkButton>}
        </div>
      </form>
      {soId && <p className="mb-3 text-sm text-ink-soft">Showing POs for one customer order. <Link href={href({ so: undefined, page: undefined })} className="text-brand-700 hover:underline">Show all</Link></p>}

      {rows.length === 0 ? (
        <EmptyState
          title={Object.values(filters).some(Boolean) ? "No purchase orders match these filters" : "No purchase orders yet"}
          action={write && <LinkButton href="/purchase-orders/new">Raise a purchase order</LinkButton>}
        >
          Raise a PO to a vendor, or open a customer order and use “Create vendor PO” to buy its pending lines.
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead><tr><Th>PO</Th><Th>Vendor</Th><Th>Date</Th><Th>For</Th><Th>Status</Th><Th className="text-right">Value</Th><Th>Received</Th></tr></thead>
            <tbody>
              {rows.map(({ po, vendorName, soNumber, customerName, projectCode, projectName }) => {
                const live = po.status === "sent" || po.status === "partial";
                const late = live && po.expectedDate != null && po.expectedDate < today;
                return (
                  <tr key={po.id} className="hover:bg-muted/50">
                    <Td className="whitespace-nowrap"><Link href={`/purchase-orders/${po.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{po.number}</Link></Td>
                    <Td className="max-w-56 truncate">{vendorName ?? "-"}</Td>
                    <Td className="whitespace-nowrap">
                      {fmtDate(po.poDate)}
                      {po.expectedDate && <div className={cx("text-xs", late ? "font-medium text-red-600" : "text-ink-soft")}>Due {fmtDate(po.expectedDate)}{late ? ", late" : ""}</div>}
                    </Td>
                    <Td className="max-w-60 whitespace-normal">
                      {soNumber ? (
                        <div>{showOrders ? <Link href={`/orders/${po.salesOrderId}`} className="hover:underline">{soNumber}</Link> : soNumber}
                          {customerName && <span className="text-xs text-ink-soft"> · {customerName}</span>}</div>
                      ) : null}
                      {projectCode && <div title={projectName ?? undefined}>{showProjects ? <Link href={`/projects/${po.projectId}`}><Badge tone="violet">{projectCode}</Badge></Link> : <Badge tone="violet">{projectCode}</Badge>}</div>}
                      {!soNumber && !projectCode && <span className="text-ink-faint">Stock</span>}
                    </Td>
                    <Td><PoStatusBadge status={po.status} /></Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{money(po.total)}</Td>
                    <Td>{po.status === "draft" || po.status === "cancelled" ? <span className="text-ink-faint">-</span> : <ReceivedBar pct={pctOf.get(po.id) ?? 0} />}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(p) => href({ page: p })} />
        </>
      )}
    </div>
  );
}

function Pill({ href, active, label, n }: { href: string; active: boolean; label: string; n: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-colors",
        active ? "border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-brand-800/30 dark:text-brand-200" : "border-line bg-surface text-ink-soft hover:bg-muted",
      )}
    >
      {label} <span className="tabular-nums">({n})</span>
    </Link>
  );
}
