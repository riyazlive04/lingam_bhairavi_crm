import Link from "next/link";
import { and, asc, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { AlertTriangle, Plus, Truck } from "lucide-react";
import { getDb } from "@/db";
import { customers, projects, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { ORDER_STATUSES } from "@/lib/constants";
import { fmtDate, money0, qty, todayIST } from "@/lib/format";
import { LINE_STATUS_LABEL, OPEN_ORDER_STATUSES, orderProgress, pendingDeliveryLines, type PendingLine } from "@/lib/orders";
import { Badge, Button, Card, EmptyState, Flash, Input, LinkButton, PageHeader, Select, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { LineProgress } from "../_components/progress";

export const metadata = { title: "Orders & Delivery" };

type SP = { q?: string; status?: string; customer?: string; project?: string; pending?: string; ok?: string; err?: string };

function OverdueBadge({ l }: { l: PendingLine }) {
  if (l.daysOverdue == null) return <span className="text-ink-faint">No date</span>;
  if (l.daysOverdue > 0) return <Badge tone="red">{l.daysOverdue}d overdue</Badge>;
  return l.expectedDate === todayIST() ? <Badge tone="amber">Due today</Badge> : <span className="text-ink-soft">On time</span>;
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
  const filtered = !!(q || status || customerId || projectId || sp.pending);

  return (
    <>
      <PageHeader
        title="Orders & Delivery"
        subtitle="Customer purchase orders, line-wise delivery status and challans"
        actions={write && <LinkButton href="/orders/new"><Plus className="h-4 w-4" aria-hidden /> New order</LinkButton>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pending lines" value={pending.length} hint={`across ${pendingOrderIds.size} open order${pendingOrderIds.size === 1 ? "" : "s"}`} tone={pending.length ? "warn" : "good"} />
        <Stat label="Overdue lines" value={overdueCount} hint="expected date passed" tone={overdueCount ? "bad" : "good"} />
        <Stat label="In transit" value={inTransit} hint="awaiting vendor supply" />
        <Stat label="Pending value" value={money0(pending.reduce((s, l) => s + l.pendingQty * l.rate, 0))} hint="ex-GST, yet to deliver" />
      </div>

      <Card
        className="mb-6"
        title={<span className="inline-flex items-center gap-2"><AlertTriangle className={cx("h-4 w-4", overdueCount ? "text-red-600" : "text-amber-500")} aria-hidden /> Pending delivery lines{customerId || projectId ? " (filtered)" : ""}</span>}
        bodyClassName="p-0"
      >
        {pending.length === 0 ? (
          <div className="p-6 text-center text-sm text-ink-soft">
            <Truck className="mx-auto mb-2 h-6 w-6 text-emerald-600" aria-hidden />
            All customer PO lines are delivered. Nothing pending.
          </div>
        ) : (
          <>
            {/* phones: compact cards */}
            <ul className="divide-y divide-line sm:hidden">
              {pending.slice(0, 100).map((l) => (
                <li key={l.lineId} className={cx("p-3", (l.daysOverdue ?? 0) > 0 && "bg-red-50/60 dark:bg-red-950/30")}>
                  <Link href={`/orders/${l.orderId}#line-${l.lineId}`} className="block">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-ink">{l.description}</span>
                      <OverdueBadge l={l} />
                    </div>
                    <div className="mt-1 text-xs text-ink-soft">{l.customerName} · PO {l.customerPoNumber || l.orderNumber}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-ink tabular-nums">{qty(l.pendingQty)} {l.uom} pending</span>
                      <StatusBadge status={l.deliveryStatus} label={LINE_STATUS_LABEL[l.deliveryStatus]} />
                      <span className="text-ink-soft">Exp. {fmtDate(l.expectedDate)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {/* tablet / desktop: table */}
            <div className="hidden sm:block">
              <Table className="rounded-none border-0 shadow-none">
                <thead>
                  <tr><Th>Customer</Th><Th>PO / Order</Th><Th>Item</Th><Th className="text-right">Qty pending</Th><Th>Status</Th><Th>Expected</Th><Th>Overdue</Th></tr>
                </thead>
                <tbody>
                  {pending.map((l) => (
                    <tr key={l.lineId} className={cx((l.daysOverdue ?? 0) > 0 && "bg-red-50/60 dark:bg-red-950/30")}>
                      <Td className="max-w-52 truncate" title={l.customerName}>{l.customerName}{l.projectName && <div className="truncate text-xs text-ink-soft">{l.projectName}</div>}</Td>
                      <Td>
                        <Link href={`/orders/${l.orderId}#line-${l.lineId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{l.customerPoNumber || "-"}</Link>
                        <div className="text-xs text-ink-soft">{l.orderNumber}</div>
                      </Td>
                      <Td className="max-w-72 whitespace-normal">{l.description}{l.remarks && <div className="text-xs text-ink-soft">{l.remarks}</div>}</Td>
                      <Td className="text-right tabular-nums">{qty(l.pendingQty)} <span className="text-xs text-ink-soft">{l.uom}</span><div className="text-xs text-ink-faint">of {qty(l.qty)}</div></Td>
                      <Td><StatusBadge status={l.deliveryStatus} label={LINE_STATUS_LABEL[l.deliveryStatus]} /></Td>
                      <Td className="whitespace-nowrap">{fmtDate(l.expectedDate)}</Td>
                      <Td><OverdueBadge l={l} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {pending.length > 100 && <p className="p-3 text-xs text-ink-soft sm:hidden">Showing 100 of {pending.length} lines. Use a wider screen or filter by customer.</p>}
          </>
        )}
      </Card>

      <h2 className="mb-2 text-lg font-semibold text-ink">Customer orders</h2>
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Filter orders">
        <label className="sr-only" htmlFor="o-q">Search</label>
        <Input id="o-q" name="q" defaultValue={q} placeholder="Order / PO no. / customer" className="lg:col-span-2" />
        <label className="sr-only" htmlFor="o-status">Status</label>
        <Select id="o-status" name="status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <label className="sr-only" htmlFor="o-customer">Customer</label>
        <Select id="o-customer" name="customer" defaultValue={customerId ? String(customerId) : ""}>
          <option value="">All customers</option>
          {custList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <label className="sr-only" htmlFor="o-project">Project</label>
        <Select id="o-project" name="project" defaultValue={projectId ? String(projectId) : ""}>
          <option value="">All projects</option>
          {projList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </Select>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="pending" value="1" defaultChecked={sp.pending === "1"} className="h-4 w-4 accent-brand-600" /> Has pending lines
          </label>
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <Button type="submit" variant="secondary">Filter</Button>
          {filtered && <LinkButton href="/orders" variant="ghost">Clear</LinkButton>}
        </div>
      </form>

      {orders.length === 0 ? (
        <EmptyState title={filtered ? "No orders match these filters" : "No customer orders yet"} action={write && !filtered ? <LinkButton href="/orders/new">Record a customer PO</LinkButton> : undefined}>
          {filtered ? "Try clearing the filters." : "Record a customer PO from a won quotation or manually."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr><Th>Order</Th><Th>Customer / project</Th><Th>Customer PO</Th><Th>Expected</Th><Th className="text-right">Value</Th><Th>Delivery</Th><Th>Status</Th></tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const p = progress.get(o.id) ?? { totalLines: 0, deliveredLines: 0, pendingLines: 0, overdueLines: 0 };
              const isOpen = (OPEN_ORDER_STATUSES as readonly string[]).includes(o.status);
              return (
                <tr key={o.id} className="hover:bg-muted/50">
                  <Td>
                    <Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{o.number}</Link>
                    <div className="text-xs text-ink-soft">{fmtDate(o.orderDate)}</div>
                  </Td>
                  <Td className="max-w-60">
                    <div className="truncate">{o.customerName ?? "-"}</div>
                    {o.projectName && <div className="truncate text-xs text-ink-soft">{o.projectName}</div>}
                  </Td>
                  <Td>{o.customerPoNumber || "-"}<div className="text-xs text-ink-soft">{fmtDate(o.customerPoDate)}</div></Td>
                  <Td className="whitespace-nowrap">{fmtDate(o.expectedDelivery)}</Td>
                  <Td className="text-right tabular-nums">{money0(o.total)}</Td>
                  <Td>
                    <LineProgress done={p.deliveredLines} total={p.totalLines} />
                    {isOpen && p.overdueLines > 0 && <Badge tone="red" className="mt-1">{p.overdueLines} overdue</Badge>}
                  </Td>
                  <Td><StatusBadge status={o.status} /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {orders.length === 200 && <p className="mt-2 text-xs text-ink-soft">Showing the latest 200 orders. Use filters to narrow down.</p>}
    </>
  );
}
