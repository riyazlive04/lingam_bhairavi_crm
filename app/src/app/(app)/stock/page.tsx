import Link from "next/link";
import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, items, projects, salesOrders, stockAllocations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canSeeCost, canWrite } from "@/lib/rbac";
import { SYSTEMS } from "@/lib/constants";
import { fmtDateTime, money, qty, round2 } from "@/lib/format";
import { latestCostOf } from "@/lib/items";
import { stockPositions } from "@/lib/stock";
import { withParams, type QueryParams } from "@/lib/url";
import { EmptyState, Flash, Select, cx } from "@/components/ui";
import {
  ConfirmButton, FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, ResponsiveTable, StatusPill, Tabs,
  type Column,
} from "@/components/patterns";
import { releaseAllocation } from "./actions";

export const metadata = { title: "Stock" };

type SP = { q?: string; system?: string; low?: string; all?: string; view?: string; status?: string; ok?: string; err?: string };

/** "/stock?a=1" from a record, skipping empty values. */
const stockHref = (params: QueryParams) => withParams("/stock", params);

const ALLOC_STATUSES = ["reserved", "released", "consumed", "all"] as const;

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("stock");
  const sp = await searchParams;
  const db = await getDb();
  const seeCost = canSeeCost(user.role);
  const write = canWrite(user.role, "stock");
  const role = user.role;
  const view = sp.view === "allocations" ? "allocations" : "onhand";
  const system = sp.system && sp.system in SYSTEMS ? sp.system : "";

  const conds: (SQL | undefined)[] = [eq(items.active, true)];
  if (system) conds.push(eq(items.system, system));
  if (sp.q) {
    const like = `%${sp.q.trim()}%`;
    conds.push(or(ilike(items.code, like), ilike(items.name, like), ilike(items.size, like), ilike(items.make, like)));
  }
  const [allItems, pos] = await Promise.all([
    db.select().from(items).where(and(...conds)).orderBy(asc(items.system), asc(items.groupName), asc(items.code)),
    stockPositions(db),
  ]);
  const rows = allItems.map((it) => {
    const p = pos.get(it.id) ?? { onHand: 0, reserved: 0, available: 0 };
    const cost = latestCostOf(it).rate ?? 0;
    const low = it.reorderLevel > 0 && p.available <= it.reorderLevel;
    return { it, ...p, cost, value: round2(Math.max(0, p.onHand) * cost), low };
  });
  const tracked = rows.filter((r) => r.onHand !== 0 || r.reserved !== 0 || r.it.reorderLevel > 0);
  let shown = sp.all === "1" ? rows : tracked;
  if (sp.low === "1") shown = shown.filter((r) => r.low);
  const totalValue = round2(tracked.reduce((s, r) => s + r.value, 0));
  const lowCount = tracked.filter((r) => r.low).length;
  const inStock = tracked.filter((r) => r.onHand > 0).length;
  const reservedLines = [...pos.values()].filter((p) => p.reserved > 0).length;

  const base = { q: sp.q, system, low: sp.low, all: sp.all };

  const common = {
    title: "Stock",
    subtitle: "Store stock from posted purchases, issues to projects, returns and adjustments, with reservations for customers and orders.",
    notices: <Flash ok={sp.ok} err={sp.err} />,
    stats: (
      <MetricStrip>
        <Metric label="Items in stock" value={inStock} />
        {seeCost ? <Metric label="Stock value (latest cost)" value={money(totalValue)} /> : <Metric label="Tracked items" value={tracked.length} />}
        <Metric label="Low stock" value={lowCount} tone={lowCount > 0 ? "bad" : "good"} href={stockHref({ low: 1 })} hint="Available at or below reorder level" />
        <Metric label="Items with reservations" value={reservedLines} href={stockHref({ view: "allocations" })} />
      </MetricStrip>
    ),
  };
  const tabs = (
    <Tabs label="Stock views" active={view} items={[
      { id: "onhand", label: "Stock on hand", href: stockHref(base) },
      { id: "allocations", label: "Allocations", count: reservedLines, href: stockHref({ view: "allocations" }) },
    ]} />
  );

  // ------------------------------------------------------------------ allocations
  if (view === "allocations") {
    const st = sp.status && (ALLOC_STATUSES as readonly string[]).includes(sp.status) ? sp.status : "reserved";
    const allocs = await db.select({
      a: stockAllocations, code: items.code, name: items.name, uom: items.uom,
      customerName: customers.name, orderNo: salesOrders.number, projectCode: projects.code,
    }).from(stockAllocations)
      .innerJoin(items, eq(items.id, stockAllocations.itemId))
      .leftJoin(customers, eq(customers.id, stockAllocations.customerId))
      .leftJoin(salesOrders, eq(salesOrders.id, stockAllocations.orderId))
      .leftJoin(projects, eq(projects.id, stockAllocations.projectId))
      .where(st === "all" ? undefined : eq(stockAllocations.status, st))
      .orderBy(desc(stockAllocations.createdAt));

    type A = (typeof allocs)[number];
    const cols: Column<A>[] = [
      { key: "item", header: "Item", card: "title", className: "max-w-72 whitespace-normal",
        cell: ({ a, name, code }) => (
          <>
            <Link href={`/stock/${a.itemId}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{name}</Link>
            <div className="font-mono text-caption text-ink-faint">{code}</div>
          </>
        ) },
      { key: "qty", header: "Qty", align: "right", card: "amount", nowrap: true,
        cell: ({ a, uom }) => <>{qty(a.qty)} <span className="text-caption text-ink-faint">{uom}</span></> },
      { key: "for", header: "Reserved for", className: "whitespace-normal",
        cell: ({ a, customerName, orderNo, projectCode }) => (
          <div className="relative z-[1]">
            {customerName && <div>{canRead(role, "customers") ? <Link href={`/customers/${a.customerId}`} className="hover:underline">{customerName}</Link> : customerName}</div>}
            {orderNo && <div className="text-caption">Order {canRead(role, "orders") ? <Link href={`/orders/${a.orderId}`} className="hover:underline">{orderNo}</Link> : orderNo}</div>}
            {projectCode && <div className="text-caption">Project {canRead(role, "projects") ? <Link href={`/projects/${a.projectId}`} className="hover:underline">{projectCode}</Link> : projectCode}</div>}
            {!customerName && !orderNo && !projectCode && "-"}
          </div>
        ) },
      { key: "since", header: "Since", nowrap: true, className: "text-caption", cell: ({ a }) => fmtDateTime(a.createdAt) },
      { key: "status", header: "Status", card: "badge", cell: ({ a }) => <StatusPill status={a.status} /> },
      { key: "notes", header: "Notes", priority: 3, className: "max-w-56 whitespace-normal text-caption text-ink-soft", cell: ({ a }) => a.notes ?? "-" },
      ...(write ? [{ key: "actions", header: <span className="sr-only">Actions</span>, label: "Actions", card: "actions" as const,
        cell: ({ a }: A) => a.status === "reserved" && (
          <form action={releaseAllocation.bind(null, a.id, "list")} className="relative z-[1]">
            <ConfirmButton size="sm" variant="secondary" stacked pendingText="Releasing…" confirm="Release this reservation? The quantity becomes available again."
              confirmLabel="Yes, release">Release</ConfirmButton>
          </form>
        ) }] : []),
    ];

    return (
      <ListPage
        {...common}
        tabs={tabs}
        filters={
          <>
            <FilterPills label="Filter by allocation status" items={ALLOC_STATUSES.map((s) => ({
              label: s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1),
              href: stockHref({ view: "allocations", status: s === "reserved" ? undefined : s }),
              active: st === s,
            }))} />
          </>
        }
        isEmpty={allocs.length === 0}
        empty={
          <EmptyState title={st === "reserved" ? "No open reservations" : "No allocations"}>
            Reserve stock for a customer, order or project from an item&apos;s stock page.
          </EmptyState>
        }
        resultSummary={`${allocs.length} allocation${allocs.length === 1 ? "" : "s"}`}
      >
        <ResponsiveTable rows={allocs} columns={cols} rowKey={(r) => r.a.id} caption="Stock allocations" />
      </ListPage>
    );
  }

  // ------------------------------------------------------------------ stock on hand
  type R = (typeof rows)[number];
  const cols: Column<R>[] = [
    { key: "item", header: "Item", card: "title", className: "max-w-80 whitespace-normal",
      cell: (r) => (
        <>
          <Link href={`/stock/${r.it.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.it.name}</Link>
          <div className="font-mono text-caption text-ink-faint">{r.it.code}</div>
        </>
      ) },
    { key: "uom", header: "UOM", priority: 3, cell: (r) => r.it.uom },
    { key: "onhand", header: "On hand", align: "right", cell: (r) => qty(r.onHand) },
    { key: "reserved", header: "Reserved", align: "right", cell: (r) => (r.reserved ? qty(r.reserved) : <span className="text-ink-faint">-</span>) },
    { key: "available", header: "Available", align: "right", card: "amount", className: "font-medium",
      cell: (r) => <span className={cx(r.available < 0 && "text-danger")}>{qty(r.available)}<span className="sm:hidden"> {r.it.uom} available</span></span> },
    { key: "flag", header: "Stock level", card: "badge",
      cell: (r) => (r.low ? <StatusPill semantic="danger" label={r.available <= 0 ? "Out of stock" : "Low"} /> : <span className="text-ink-faint">-</span>) },
    { key: "reorder", header: "Reorder at", align: "right", priority: 3, cell: (r) => (r.it.reorderLevel ? qty(r.it.reorderLevel) : <span className="text-ink-faint">-</span>) },
    ...(seeCost ? [
      { key: "cost", header: "Latest cost", align: "right" as const, priority: 3 as const, nowrap: true, cell: (r: R) => money(r.cost) },
      { key: "value", header: "Value", align: "right" as const, nowrap: true, cell: (r: R) => money(r.value) },
    ] : []),
  ];
  const activeFilters = [sp.q?.trim(), system].filter(Boolean).length;

  return (
    <ListPage
      {...common}
      tabs={tabs}
      filters={
        <>
          <FilterPills label="Filter stock" items={[
            { label: "Tracked items", href: stockHref({ q: sp.q, system }), active: sp.low !== "1" && sp.all !== "1", count: tracked.length },
            { label: "Low stock", href: stockHref({ q: sp.q, system, low: 1 }), active: sp.low === "1", count: lowCount, attention: lowCount > 0 },
            { label: "Include items never stocked", href: stockHref({ q: sp.q, system, all: 1 }), active: sp.all === "1" && sp.low !== "1" },
          ]} />
          <ListFilters q={sp.q} placeholder="Search code, name, size" clearHref={stockHref({ low: sp.low, all: sp.all })} activeCount={activeFilters}
            hidden={{ low: sp.low, all: sp.all }}>
            <Select name="system" defaultValue={system} aria-label="System">
              <option value="">All systems</option>
              {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </ListFilters>
        </>
      }
      isEmpty={shown.length === 0}
      empty={
        sp.low === "1"
          ? <EmptyState title="No low stock items">Every tracked item is above its reorder level.</EmptyState>
          : (
            <ListEmpty filtered={activeFilters > 0} noun="stock" clearHref="/stock" title={activeFilters > 0 ? "No stock matches these filters" : "No stock yet"}>
              Stock is created when purchase invoices without a project are posted, or from opening stock on an item&apos;s stock page. Choose Include items never stocked to add opening stock.
            </ListEmpty>
          )
      }
      resultSummary={`${shown.length} item${shown.length === 1 ? "" : "s"}`}
    >
      <ResponsiveTable rows={shown} columns={cols} rowKey={(r) => r.it.id} caption="Stock on hand"
        rowClassName={(r) => r.low && "bg-danger-soft"} />
    </ListPage>
  );
}
