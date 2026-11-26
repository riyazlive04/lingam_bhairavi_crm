import Link from "next/link";
import { and, asc, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, projects, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { ORDER_STATUSES } from "@/lib/constants";
import { fmtDate, money0, qty, todayIST } from "@/lib/format";
import { LINE_STATUS_LABEL, OPEN_ORDER_STATUSES, orderProgress, pendingDeliveryLines, type PendingLine } from "@/lib/orders";
import { Flash, LinkButton, Select, cx } from "@/components/ui";
import {
  ListEmpty, ListFilters, ListPage, Metric, MetricStrip, ResponsiveTable, StatusPill, Tabs, activeTab, statusLabel,
  type Column,
} from "@/components/patterns";
import { LineProgress } from "../_components/progress";

export const metadata = { title: "Orders & delivery" };

type SP = { q?: string; status?: string; customer?: string; project?: string; pending?: string; tab?: string; ok?: string; err?: string };

function OverdueChip({ l, today }: { l: PendingLine; today: string }) {
  if (l.daysOverdue == null) return <span className="text-ink-faint">No date</span>;
  if (l.daysOverdue > 0) return <StatusPill status="overdue" label={`${l.daysOverdue} day${l.daysOverdue === 1 ? "" : "s"} overdue`} />;
  return l.expectedDate === today ? <StatusPill status="due_soon" label="Due today" /> : <span className="text-ink-soft">On time</span>;
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("orders");
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();
  const customerId = Number(sp.customer) || undefined;
  const projectId = Number(sp.project) || undefined;
  const status = (ORDER_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const q = sp.q?.trim();

  // Filter dropdown data does not depend on anything else: start it now, await it later.
  const listsP = Promise.all([
    db.select({ id: customers.id, name: customers.name }).from(customers).orderBy(asc(customers.name)),
    db.select({ id: projects.id, name: projects.name, code: projects.code }).from(projects).orderBy(desc(projects.id)).limit(300),
  ]);
  const pending = await pendingDeliveryLines(db, { customerId, projectId, today });
  const overdueCount = pending.filter((l) => (l.daysOverdue ?? 0) > 0).length;
  const inTransit = pending.filter((l) => l.deliveryStatus === "in_transit").length;
  const pendingOrderIds = new Set(pending.map((l) => l.orderId));

  const where: SQL[] = [];
  if (status) where.push(eq(salesOrders.status, status));
  if (customerId) where.push(eq(salesOrders.customerId, customerId));
  if (projectId) where.push(eq(salesOrders.projectId, projectId));
  if (q) {
    const like = `%${q}%`;
    const c = or(ilike(salesOrders.number, like), ilike(salesOrders.customerPoNumber, like), ilike(customers.name, like));
    if (c) where.push(c);
  }
  if (sp.pending === "1") where.push(pendingOrderIds.size ? inArray(salesOrders.id, [...pendingOrderIds]) : eq(salesOrders.id, -1));

  const orders = await db
    .select({
      id: salesOrders.id, number: salesOrders.number, customerPoNumber: salesOrders.customerPoNumber, customerPoDate: salesOrders.customerPoDate,
      status: salesOrders.status, orderDate: salesOrders.orderDate, expectedDelivery: salesOrders.expectedDelivery, total: salesOrders.total,
      customerName: customers.name, projectName: projects.name,
    })
    .from(salesOrders)
    .leftJoin(customers, eq(customers.id, salesOrders.customerId))
    .leftJoin(projects, eq(projects.id, salesOrders.projectId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(salesOrders.orderDate), desc(salesOrders.id))
    .limit(200);
  const progress = await orderProgress(db, orders.map((o) => o.id), today);

  const [custList, projList] = await listsP;
  const write = canWrite(user.role, "orders");

  const tab = activeTab(sp.tab, ["orders", "pending"] as const);
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ok: undefined, err: undefined, ...patch })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/orders?${s}` : "/orders";
  };
  const orderFilters = [q, status, customerId, projectId, sp.pending === "1" ? "1" : undefined].filter(Boolean).length;
  const lineFilters = [customerId, projectId].filter(Boolean).length;

  type Order = (typeof orders)[number];
  const orderCols: Column<Order>[] = [
    { key: "no", header: "Order", card: "title", nowrap: true,
      cell: (o) => (
        <>
          <Link href={`/orders/${o.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{o.number}</Link>
          <div className="text-caption font-normal text-ink-soft">{fmtDate(o.orderDate)}</div>
        </>
      ) },
    { key: "customer", header: "Customer / project", card: "subtitle", className: "max-w-60 whitespace-normal",
      cell: (o) => (
        <>
          <div className="font-medium text-ink">{o.customerName ?? "-"}</div>
          {o.projectName && <div className="truncate text-caption text-ink-soft">{o.projectName}</div>}
        </>
      ) },
    { key: "status", header: "Status", card: "badge", cell: (o) => <StatusPill status={o.status} /> },
    { key: "value", header: "Value", align: "right", card: "amount", nowrap: true, cell: (o) => money0(o.total) },
    { key: "po", header: "Customer PO", nowrap: true,
      cell: (o) => <>{o.customerPoNumber || "-"}{o.customerPoDate && <div className="text-caption text-ink-soft">{fmtDate(o.customerPoDate)}</div>}</> },
    { key: "expected", header: "Expected", nowrap: true, priority: 3, cell: (o) => fmtDate(o.expectedDelivery) },
    { key: "delivery", header: "Delivery",
      cell: (o) => {
        const p = progress.get(o.id) ?? { totalLines: 0, deliveredLines: 0, pendingLines: 0, overdueLines: 0 };
        const isOpen = (OPEN_ORDER_STATUSES as readonly string[]).includes(o.status);
        return (
          <div className="flex flex-col gap-1 max-sm:w-40">
            <LineProgress done={p.deliveredLines} total={p.totalLines} />
            {isOpen && p.overdueLines > 0 && <StatusPill status="overdue" label={`${p.overdueLines} overdue`} />}
          </div>
        );
      } },
  ];

  const lineCols: Column<PendingLine>[] = [
    { key: "item", header: "Item", card: "title", className: "max-w-72 whitespace-normal",
      cell: (l) => (
        <>
          <Link href={`/orders/${l.orderId}#line-${l.lineId}`} className="rt-stretch font-medium text-ink hover:underline">{l.description}</Link>
          {l.remarks && <div className="text-caption font-normal text-ink-soft">{l.remarks}</div>}
        </>
      ) },
    { key: "overdue", header: "Overdue", card: "badge", nowrap: true, cell: (l) => <OverdueChip l={l} today={today} /> },
    { key: "customer", header: "Customer", card: "subtitle", className: "max-w-52 whitespace-normal",
      cell: (l) => <>{l.customerName}{l.projectName && <div className="truncate text-caption text-ink-soft">{l.projectName}</div>}</> },
    { key: "pending", header: "Qty pending", align: "right", card: "amount", nowrap: true,
      cell: (l) => <>{qty(l.pendingQty)} <span className="text-caption text-ink-soft">{l.uom}</span><div className="text-caption font-normal text-ink-faint">of {qty(l.qty)}</div></> },
    { key: "po", header: "PO / order", nowrap: true,
      cell: (l) => <>{l.customerPoNumber || "-"}<div className="text-caption text-ink-soft">{l.orderNumber}</div></> },
    { key: "status", header: "Status", cell: (l) => <StatusPill status={l.deliveryStatus} label={LINE_STATUS_LABEL[l.deliveryStatus]} /> },
    { key: "expected", header: "Expected", nowrap: true, priority: 3, cell: (l) => fmtDate(l.expectedDate) },
  ];

  const custSelect = (
    <Select name="customer" defaultValue={customerId ? String(customerId) : ""} aria-label="Customer">
      <option value="">All customers</option>
      {custList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>
  );
  const projSelect = (
    <Select name="project" defaultValue={projectId ? String(projectId) : ""} aria-label="Project">
      <option value="">All projects</option>
      {projList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
    </Select>
  );

  return (
    <ListPage
      title="Orders & delivery"
      subtitle="Customer purchase orders, line-wise delivery status and challans."
      primaryAction={write && <LinkButton href="/orders/new"><Plus className="icon-sm" aria-hidden /> New order</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={
        <MetricStrip>
          <Metric label="Pending lines" value={pending.length} hint={`Across ${pendingOrderIds.size} open order${pendingOrderIds.size === 1 ? "" : "s"}`}
            tone={pending.length ? "warn" : "good"} href={qs({ tab: "pending" })} />
          <Metric label="Overdue lines" value={overdueCount} hint="Expected date has passed" tone={overdueCount ? "bad" : "good"} href={qs({ tab: "pending" })} />
          <Metric label="In transit" value={inTransit} hint="Waiting for vendor supply" />
          <Metric label="Pending value" value={money0(pending.reduce((s, l) => s + l.pendingQty * l.rate, 0))} hint="Ex-GST, yet to deliver" />
        </MetricStrip>
      }
      filters={
        <>
          <Tabs label="Order views" basePath="/orders" params={{ ...sp, ok: undefined, err: undefined }} active={tab} items={[
            { id: "orders", label: "Customer orders", count: orders.length },
            { id: "pending", label: "Pending delivery lines", count: pending.length, alert: overdueCount > 0 },
          ]} />
          {tab === "orders" ? (
            <ListFilters q={q} placeholder="Search order, PO number, customer" clearHref="/orders" activeCount={orderFilters}>
              <Select name="status" defaultValue={status ?? ""} aria-label="Status">
                <option value="">All statuses</option>
                {ORDER_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </Select>
              {custSelect}
              {projSelect}
              <Select name="pending" defaultValue={sp.pending === "1" ? "1" : ""} aria-label="Delivery">
                <option value="">Any delivery state</option>
                <option value="1">Has pending lines</option>
              </Select>
            </ListFilters>
          ) : (
            <ListFilters searchName={false} clearHref="/orders?tab=pending" activeCount={lineFilters} hidden={{ tab: "pending" }}>
              {custSelect}
              {projSelect}
            </ListFilters>
          )}
        </>
      }
      isEmpty={tab === "orders" ? orders.length === 0 : pending.length === 0}
      empty={tab === "orders"
        ? (
          <ListEmpty filtered={orderFilters > 0} noun="orders" clearHref="/orders" title={orderFilters > 0 ? undefined : "No customer orders yet"}
            action={write && <LinkButton href="/orders/new"><Plus className="icon-sm" aria-hidden /> Record a customer PO</LinkButton>}>
            Record a customer PO from a won quotation or enter it by hand.
          </ListEmpty>
        )
        : (
          <ListEmpty filtered={false} noun="pending lines" title={lineFilters > 0 ? "Nothing pending for these filters" : "Nothing pending"}>
            Every customer PO line is delivered.
          </ListEmpty>
        )}
      resultSummary={tab === "orders"
        ? (orders.length === 200 ? "Showing the latest 200 orders. Use filters to narrow down." : `${orders.length} order${orders.length === 1 ? "" : "s"}`)
        : `${pending.length} pending line${pending.length === 1 ? "" : "s"}${overdueCount ? ` · ${overdueCount} overdue` : ""}`}
    >
      {tab === "orders"
        ? <ResponsiveTable rows={orders} columns={orderCols} rowKey={(o) => o.id} caption="Customer orders" />
        : (
          <ResponsiveTable rows={pending} columns={lineCols} rowKey={(l) => l.lineId} caption="Pending delivery lines"
            rowClassName={(l) => cx((l.daysOverdue ?? 0) > 0 && "bg-danger-soft")} />
        )}
    </ListPage>
  );
}
