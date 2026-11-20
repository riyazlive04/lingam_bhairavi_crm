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
import { Badge, Button, EmptyState, Flash, Input, PageHeader, Select, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { LinkTabs, qs } from "../items/_components/tabs";
import { releaseAllocation } from "./actions";

type SP = { q?: string; system?: string; low?: string; all?: string; view?: string; status?: string; ok?: string; err?: string };

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("stock");
  const sp = await searchParams;
  const db = await getDb();
  const seeCost = canSeeCost(user.role);
  const write = canWrite(user.role, "stock");
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
  const tabs = [
    { href: "/stock" + qs(base), label: "Stock on hand", active: view === "onhand" },
    { href: "/stock" + qs({ view: "allocations" }), label: "Allocations", active: view === "allocations" },
  ];

  return (
    <div>
      <PageHeader title="Stock" subtitle="Store stock from posted purchases, issues to projects, returns and adjustments — with reservations for customers and orders." />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Items in stock" value={inStock} />
        {seeCost ? <Stat label="Stock value (latest cost)" value={money(totalValue)} /> : <Stat label="Tracked items" value={tracked.length} />}
        <Stat label="Low stock" value={lowCount} tone={lowCount > 0 ? "bad" : "good"} href={"/stock" + qs({ low: 1 })} hint="Available ≤ reorder level" />
        <Stat label="Items with reservations" value={reservedLines} href={"/stock" + qs({ view: "allocations" })} />
      </div>
      <LinkTabs tabs={tabs} />
      {view === "allocations" ? <Allocations status={sp.status} write={write} role={user.role} /> : (
        <>
          <form method="get" className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="sm:w-72"><span className="sr-only">Search</span><Input name="q" defaultValue={sp.q} placeholder="Search code, name, size…" /></label>
            <label className="sm:w-56"><span className="sr-only">System</span>
              <Select name="system" defaultValue={system}>
                <option value="">All systems</option>
                {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </label>
            <label className="flex items-center gap-1.5 text-sm text-ink-soft"><input type="checkbox" name="low" value="1" defaultChecked={sp.low === "1"} className="h-4 w-4 accent-brand-600" /> Low stock only</label>
            <label className="flex items-center gap-1.5 text-sm text-ink-soft"><input type="checkbox" name="all" value="1" defaultChecked={sp.all === "1"} className="h-4 w-4 accent-brand-600" /> Include items never stocked</label>
            <Button type="submit" variant="secondary">Filter</Button>
          </form>
          {shown.length === 0 ? (
            <EmptyState title={sp.low === "1" ? "No low-stock items" : "No stock yet"}>
              Stock is created when purchase invoices (without a project) are posted, or via opening stock on an item&apos;s stock page. Tick “Include items never stocked” to add opening stock.
            </EmptyState>
          ) : (
            <Table>
              <thead><tr>
                <Th>Item</Th><Th>UOM</Th><Th className="text-right">On hand</Th><Th className="text-right">Reserved</Th><Th className="text-right">Available</Th><Th className="text-right">Reorder</Th>
                {seeCost && <><Th className="text-right">Latest cost</Th><Th className="text-right">Value</Th></>}
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.it.id} className={cx("hover:bg-muted/50", r.low && "bg-red-50/60 dark:bg-red-950/30")}>
                    <Td className="max-w-80 whitespace-normal"><Link href={`/stock/${r.it.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.it.name}</Link>
                      <div className="font-mono text-xs text-ink-faint">{r.it.code}</div></Td>
                    <Td>{r.it.uom}</Td>
                    <Td className="text-right tabular-nums">{qty(r.onHand)}</Td>
                    <Td className="text-right tabular-nums">{r.reserved ? qty(r.reserved) : <span className="text-ink-faint">—</span>}</Td>
                    <Td className={cx("text-right font-medium tabular-nums", r.available < 0 && "text-red-600")}>{qty(r.available)}
                      {r.low && <div><Badge tone="red">{r.available <= 0 ? "out" : "low"}</Badge></div>}</Td>
                    <Td className="text-right tabular-nums">{r.it.reorderLevel ? qty(r.it.reorderLevel) : <span className="text-ink-faint">—</span>}</Td>
                    {seeCost && <><Td className="text-right tabular-nums">{money(r.cost)}</Td><Td className="text-right tabular-nums">{money(r.value)}</Td></>}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}

async function Allocations({ status, write, role }: { status?: string; write: boolean; role: Parameters<typeof canRead>[0] }) {
  const db = await getDb();
  const st = status && ["reserved", "released", "consumed", "all"].includes(status) ? status : "reserved";
  const rows = await db.select({
    a: stockAllocations, code: items.code, name: items.name, uom: items.uom,
    customerName: customers.name, orderNo: salesOrders.number, projectCode: projects.code,
  }).from(stockAllocations)
    .innerJoin(items, eq(items.id, stockAllocations.itemId))
    .leftJoin(customers, eq(customers.id, stockAllocations.customerId))
    .leftJoin(salesOrders, eq(salesOrders.id, stockAllocations.orderId))
    .leftJoin(projects, eq(projects.id, stockAllocations.projectId))
    .where(st === "all" ? undefined : eq(stockAllocations.status, st))
    .orderBy(desc(stockAllocations.createdAt));
  return (
    <>
      <form method="get" className="mb-4 flex gap-2">
        <input type="hidden" name="view" value="allocations" />
        <label className="w-48"><span className="sr-only">Status</span>
          <Select name="status" defaultValue={st}>
            <option value="reserved">Reserved</option><option value="released">Released</option><option value="consumed">Consumed</option><option value="all">All</option>
          </Select>
        </label>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      {rows.length === 0 ? <EmptyState title="No allocations">Reserve stock for a customer, order or project from an item&apos;s stock page.</EmptyState> : (
        <Table>
          <thead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th>Reserved for</Th><Th>Since</Th><Th>Status</Th><Th>Notes</Th>{write && <Th><span className="sr-only">Actions</span></Th>}</tr></thead>
          <tbody>{rows.map(({ a, code, name, uom, customerName, orderNo, projectCode }) => (
            <tr key={a.id}>
              <Td className="max-w-72 whitespace-normal"><Link href={`/stock/${a.itemId}`} className="hover:underline">{name}</Link><div className="font-mono text-xs text-ink-faint">{code}</div></Td>
              <Td className="text-right tabular-nums">{qty(a.qty)} <span className="text-xs text-ink-faint">{uom}</span></Td>
              <Td className="text-sm">
                {customerName && <div>{canRead(role, "customers") ? <Link href={`/customers/${a.customerId}`} className="hover:underline">{customerName}</Link> : customerName}</div>}
                {orderNo && <div className="text-xs">Order {canRead(role, "orders") ? <Link href={`/orders/${a.orderId}`} className="hover:underline">{orderNo}</Link> : orderNo}</div>}
                {projectCode && <div className="text-xs">Project {canRead(role, "projects") ? <Link href={`/projects/${a.projectId}`} className="hover:underline">{projectCode}</Link> : projectCode}</div>}
              </Td>
              <Td className="text-xs">{fmtDateTime(a.createdAt)}</Td>
              <Td><StatusBadge status={a.status === "reserved" ? "pending" : a.status === "consumed" ? "done" : "closed"} label={a.status} /></Td>
              <Td className="max-w-56 whitespace-normal text-xs">{a.notes ?? "—"}</Td>
              {write && <Td>{a.status === "reserved" && (
                <form action={releaseAllocation.bind(null, a.id, "list")}><SubmitButton size="sm" variant="secondary" pendingText="…" confirm="Release this reservation?">Release</SubmitButton></form>
              )}</Td>}
            </tr>
          ))}</tbody>
        </Table>
      )}
    </>
  );
}
