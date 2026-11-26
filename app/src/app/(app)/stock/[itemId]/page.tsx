import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, items, projects, purchaseInvoices, salesOrders, stockAllocations, stockMovements, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canSeeCost, canWrite } from "@/lib/rbac";
import { fmtDate, fmtDateTime, money, qty, round2, todayIST } from "@/lib/format";
import { latestCostOf } from "@/lib/items";
import { MOVEMENT_TYPES, type MovementType } from "@/lib/stock";
import { Lock, PackageMinus, PackagePlus, SlidersHorizontal, Tag, Warehouse } from "lucide-react";
import { Field, Flash, Input, LinkButton, Select, cx } from "@/components/ui";
import {
  Callout, ConfirmButton, DetailPage, MetaChip, ResponsiveTable, SectionCard, StatusPill, SummaryRows, Tabs, activeTab, tabHref,
  type Column, type StatusSemantic, type TabItem,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { adjustStock, allocateStock, issueToProject, releaseAllocation, returnFromProject } from "../actions";

export const metadata = { title: "Stock ledger" };

const TYPE_SEMANTIC: Record<string, StatusSemantic> = {
  purchase_in: "success", opening: "success", issue_project: "progress", return: "info", sale_out: "danger", adjust: "warning", sales_return: "info", purchase_return: "danger",
};

export default async function StockItemPage({ params, searchParams }: { params: Promise<{ itemId: string }>; searchParams: Promise<{ ok?: string; err?: string; tab?: string }> }) {
  const user = await requireUser("stock");
  const { itemId: idStr } = await params;
  const sp = await searchParams;
  const itemId = Number(idStr);
  if (!Number.isInteger(itemId)) notFound();
  const db = await getDb();
  const [it] = await db.select().from(items).where(eq(items.id, itemId));
  if (!it) notFound();
  const seeCost = canSeeCost(user.role);
  const write = canWrite(user.role, "stock");
  const today = todayIST();
  const role = user.role;

  const [moves, allocs] = await Promise.all([
    db.select({ m: stockMovements, projectCode: projects.code, by: users.name }).from(stockMovements)
      .leftJoin(projects, eq(projects.id, stockMovements.projectId)).leftJoin(users, eq(users.id, stockMovements.createdBy))
      .where(eq(stockMovements.itemId, itemId)).orderBy(asc(stockMovements.date), asc(stockMovements.id)),
    db.select({ a: stockAllocations, customerName: customers.name, orderNo: salesOrders.number, projectCode: projects.code }).from(stockAllocations)
      .leftJoin(customers, eq(customers.id, stockAllocations.customerId))
      .leftJoin(salesOrders, eq(salesOrders.id, stockAllocations.orderId))
      .leftJoin(projects, eq(projects.id, stockAllocations.projectId))
      .where(eq(stockAllocations.itemId, itemId)).orderBy(desc(stockAllocations.createdAt)),
  ]);
  const piIds = [...new Set(moves.filter((x) => x.m.refType === "purchase_invoice" && x.m.refId).map((x) => x.m.refId!))];
  const piNos = new Map(piIds.length ? (await db.select({ id: purchaseInvoices.id, no: purchaseInvoices.invoiceNo }).from(purchaseInvoices).where(inArray(purchaseInvoices.id, piIds))).map((r) => [r.id, r.no]) : []);

  let bal = 0;
  const ledger = moves.map((x) => { bal = round2(bal + Number(x.m.qty)); return { ...x, balance: bal }; }).reverse();
  const onHand = bal;
  const reserved = allocs.filter((a) => a.a.status === "reserved").reduce((s, a) => s + a.a.qty, 0);
  const available = onHand - reserved;
  const cost = latestCostOf(it).rate ?? 0;

  // Per-project net issued (for the return form)
  const netByProject = new Map<number, { code: string; net: number }>();
  for (const x of moves) {
    if (!x.m.projectId || (x.m.type !== "issue_project" && x.m.type !== "return")) continue;
    const e = netByProject.get(x.m.projectId) ?? { code: x.projectCode ?? `#${x.m.projectId}`, net: 0 };
    e.net = round2(e.net - Number(x.m.qty));
    netByProject.set(x.m.projectId, e);
  }
  const returnable = [...netByProject.entries()].filter(([, v]) => v.net > 0);

  const [projList, custList, orderList] = write ? await Promise.all([
    db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).where(ne(projects.status, "closed")).orderBy(asc(projects.code)),
    db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name)),
    db.select({ id: salesOrders.id, number: salesOrders.number, customerName: customers.name }).from(salesOrders)
      .leftJoin(customers, eq(customers.id, salesOrders.customerId))
      .where(and(sql`${salesOrders.status} not in ('delivered','closed','cancelled')`)).orderBy(desc(salesOrders.orderDate)),
  ]) : [[], [], []];

  const link = (mod: Parameters<typeof canRead>[1], href: string, text: string) => canRead(role, mod) ? <Link href={href} className="relative z-[1] hover:underline">{text}</Link> : text;

  // ------------------------------------------------------------------ tabs (?tab=)
  const tabIds = ["ledger", "allocations", ...(write ? ["record" as const] : [])] as const;
  const tab = activeTab(sp.tab, tabIds);
  const openAllocs = allocs.filter((a) => a.a.status === "reserved").length;
  const tabItems: TabItem[] = [
    { id: "ledger", label: "Movements", count: moves.length },
    { id: "allocations", label: "Allocations", count: allocs.length },
    ...(write ? [{ id: "record", label: "Record movement" }] : []),
  ];
  const base = `/stock/${it.id}`;
  const tabParams = { tab: sp.tab };
  const lowStock = it.reorderLevel > 0 && available <= it.reorderLevel;

  type Alloc = (typeof allocs)[number];
  const allocCols: Column<Alloc>[] = [
    { key: "since", header: "Since", card: "subtitle", nowrap: true, className: "text-caption", cell: ({ a }) => fmtDateTime(a.createdAt) },
    { key: "qty", header: "Qty", align: "right", card: "amount", cell: ({ a }) => `${qty(a.qty)} ${it.uom}` },
    { key: "for", header: "Reserved for", card: "title", className: "whitespace-normal",
      cell: ({ a, customerName, orderNo, projectCode }) => (
        <>
          {customerName && <div>{link("customers", `/customers/${a.customerId}`, customerName)}</div>}
          {orderNo && <div className="text-caption">Order {link("orders", `/orders/${a.orderId}`, orderNo)}</div>}
          {projectCode && <div className="text-caption">Project {link("projects", `/projects/${a.projectId}`, projectCode)}</div>}
          {!customerName && !orderNo && !projectCode && "-"}
        </>
      ) },
    { key: "status", header: "Status", card: "badge", cell: ({ a }) => <StatusPill status={a.status} /> },
    { key: "notes", header: "Notes", className: "max-w-56 whitespace-normal text-caption text-ink-soft", cell: ({ a }) => a.notes ?? "-" },
    ...(write ? [{ key: "actions", header: <span className="sr-only">Actions</span>, label: "Actions", card: "actions" as const,
      cell: ({ a }: Alloc) => a.status === "reserved" && (
        <form action={releaseAllocation.bind(null, a.id, "item")}>
          <ConfirmButton size="sm" variant="secondary" stacked pendingText="Releasing…" confirm="Release this reservation? The quantity becomes available again."
            confirmLabel="Yes, release">Release</ConfirmButton>
        </form>
      ) }] : []),
  ];
  type Move = (typeof ledger)[number];
  const moveCols: Column<Move>[] = [
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: ({ m }) => fmtDate(m.date) },
    { key: "type", header: "Type", card: "title",
      cell: ({ m }) => <StatusPill semantic={TYPE_SEMANTIC[m.type] ?? "neutral"} label={MOVEMENT_TYPES[m.type as MovementType] ?? m.type} noDot /> },
    { key: "in", header: "In", align: "right", className: "text-success", cell: ({ m }) => (m.qty > 0 ? qty(m.qty) : "") },
    { key: "out", header: "Out", align: "right", className: "text-danger", cell: ({ m }) => (m.qty < 0 ? qty(-m.qty) : "") },
    { key: "balance", header: "Balance", align: "right", card: "amount", className: "font-medium",
      cell: ({ balance }) => <span className={cx(balance < 0 && "text-danger")}>{qty(balance)}</span> },
    ...(seeCost ? [{ key: "rate", header: "Rate", align: "right" as const, priority: 3 as const, cell: ({ m }: Move) => money(m.rate) }] : []),
    { key: "ref", header: "Project or reference", className: "text-caption",
      cell: ({ m, projectCode }) => (
        <>
          {projectCode && <div>{link("projects", `/projects/${m.projectId}`, projectCode)}</div>}
          {m.refType === "purchase_invoice" && m.refId && <div>{link("purchases", `/purchases/${m.refId}`, `PI ${piNos.get(m.refId) ?? m.refId}`)}</div>}
          {!projectCode && !(m.refType === "purchase_invoice" && m.refId) && "-"}
        </>
      ) },
    { key: "notes", header: "Notes", priority: 3, className: "max-w-56 whitespace-normal text-caption text-ink-soft", cell: ({ m }) => m.notes ?? "" },
    { key: "by", header: "By", priority: 3, className: "text-caption", cell: ({ by }) => by ?? "-" },
  ];

  return (
    <DetailPage
      back={{ href: "/stock", label: "Stock" }}
      eyebrow="Stock ledger"
      title={it.name}
      status={lowStock ? <StatusPill semantic="danger" label={available <= 0 ? "Out of stock" : "Low stock"} /> : undefined}
      meta={
        <>
          <MetaChip label="Code"><span className="font-mono">{it.code}</span></MetaChip>
          <MetaChip label="On hand">{qty(onHand)} {it.uom}</MetaChip>
          <MetaChip label="Available">{qty(available)} {it.uom}</MetaChip>
          {it.reorderLevel > 0 && <MetaChip label="Reorder at">{qty(it.reorderLevel)}</MetaChip>}
        </>
      }
      primaryAction={write && tab !== "record" && (
        <LinkButton href={`${tabHref(base, tabParams, "record", "ledger")}#issue`}><PackageMinus className="icon-sm" aria-hidden /> Issue to project</LinkButton>
      )}
      secondaryActions={<LinkButton href={`/items/${it.id}`} variant="secondary"><Tag className="icon-sm" aria-hidden /> Item and prices</LinkButton>}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {available < 0 && (
            <Callout tone="danger" title="More is reserved than is on hand">
              Release a reservation or record the missing stock so the available quantity is not negative.
            </Callout>
          )}
        </>
      }
      tabs={<Tabs label="Stock sections" basePath={base} params={tabParams} active={tab} items={tabItems} />}
      aside={
        <SectionCard title="Stock position" icon={Warehouse}>
          <SummaryRows rows={[
            ["On hand", `${qty(onHand)} ${it.uom}`],
            ["Reserved", `${qty(reserved)} ${it.uom}`],
            ["Available", <span key="a" className={cx(lowStock && "text-danger")}>{qty(available)} {it.uom}</span>],
            ["Reorder level", it.reorderLevel > 0 ? qty(it.reorderLevel) : "Not set"],
            ["Open allocations", openAllocs],
            ...(seeCost
              ? [["Value (latest cost)", money(round2(Math.max(0, onHand) * cost))] as [string, string], ["Latest cost", `${money(cost)} / ${it.uom}`] as [string, string]]
              : [["Movements", moves.length] as [string, number]]),
          ]} />
        </SectionCard>
      }
    >
      {tab === "ledger" && (
        <SectionCard title="Movements ledger" count={moves.length} flush
          empty={ledger.length === 0 && "No movements yet. Post a purchase invoice or record opening stock to start the ledger."}>
          <ResponsiveTable flush rows={ledger} columns={moveCols} rowKey={(r) => r.m.id} caption="Stock movements" />
        </SectionCard>
      )}

      {tab === "allocations" && (
        <SectionCard title="Allocations" count={allocs.length} flush
          empty={allocs.length === 0 && (write ? "No reservations for this item. Reserve stock from the Record movement tab." : "No reservations for this item.")}>
          <ResponsiveTable flush rows={allocs} columns={allocCols} rowKey={(r) => r.a.id} caption="Allocations" />
        </SectionCard>
      )}

      {tab === "record" && write && (
        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard id="issue" title="Issue to project" icon={PackageMinus}
            description={seeCost ? `Issued at the latest cost of ${money(cost)} per ${it.uom}.` : undefined}
            empty={projList.length === 0 && "No open projects. Create or reopen a project to issue stock to it."}>
            <form action={issueToProject.bind(null, it.id)} className="grid gap-3 sm:grid-cols-2">
              <Field label="Project" required className="sm:col-span-2">
                <Select name="projectId" required defaultValue=""><option value="" disabled>Choose project…</option>
                  {projList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select>
              </Field>
              <Field label={`Qty (${it.uom})`} required hint={`On hand ${qty(onHand)}`}><Input name="qty" type="number" inputMode="decimal" step="any" min={0} max={Math.max(0, onHand)} required className="text-right" /></Field>
              <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
              <Field label="Notes" className="sm:col-span-2"><Input name="notes" maxLength={500} placeholder="DC no., engineer…" /></Field>
              <div className="sm:col-span-2"><SubmitButton size="sm" disabled={onHand <= 0} pendingText="Issuing…">Issue to project</SubmitButton></div>
            </form>
          </SectionCard>
          <SectionCard title="Return from project" icon={PackagePlus}
            empty={returnable.length === 0 && "Nothing of this item is issued to a project right now."}>
            <form action={returnFromProject.bind(null, it.id)} className="grid gap-3 sm:grid-cols-2">
              <Field label="Project" required className="sm:col-span-2">
                <Select name="projectId" required defaultValue=""><option value="" disabled>Choose project…</option>
                  {returnable.map(([pid, v]) => <option key={pid} value={pid}>{v.code}: {qty(v.net)} {it.uom} issued</option>)}</Select>
              </Field>
              <Field label={`Qty (${it.uom})`} required><Input name="qty" type="number" inputMode="decimal" step="any" min={0} required className="text-right" /></Field>
              <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
              <Field label="Notes" className="sm:col-span-2"><Input name="notes" maxLength={500} /></Field>
              <div className="sm:col-span-2"><SubmitButton size="sm" pendingText="Saving…">Record return</SubmitButton></div>
            </form>
          </SectionCard>
          <SectionCard title="Adjust or add opening stock" icon={SlidersHorizontal}>
            <form action={adjustStock.bind(null, it.id)} className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" required>
                <Select name="kind" defaultValue={moves.length ? "adjust" : "opening"}><option value="adjust">Adjustment (plus or minus)</option><option value="opening">Opening stock</option></Select>
              </Field>
              <Field label={`Qty (${it.uom})`} required hint="Negative to reduce"><Input name="qty" type="number" inputMode="decimal" step="any" required className="text-right" /></Field>
              <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
              <Field label="Reason" required><Input name="reason" required minLength={3} maxLength={500} placeholder="Physical count, damage…" /></Field>
              <div className="sm:col-span-2"><SubmitButton size="sm" pendingText="Saving…">Record adjustment</SubmitButton></div>
            </form>
          </SectionCard>
          <SectionCard title="Reserve stock" icon={Lock} description="Hold stock for a customer, order or project so it is not issued elsewhere.">
            <form action={allocateStock.bind(null, it.id)} className="grid gap-3 sm:grid-cols-2">
              <Field label={`Qty (${it.uom})`} required hint={`Available ${qty(available)}`}><Input name="qty" type="number" inputMode="decimal" step="any" min={0} max={Math.max(0, available)} required className="text-right" /></Field>
              <Field label="Customer"><Select name="customerId" defaultValue=""><option value="">-</option>{custList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Sales order"><Select name="orderId" defaultValue=""><option value="">-</option>{orderList.map((o) => <option key={o.id} value={o.id}>{o.number}{o.customerName ? ` · ${o.customerName}` : ""}</option>)}</Select></Field>
              <Field label="Project"><Select name="projectId" defaultValue=""><option value="">-</option>{projList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select></Field>
              <Field label="Notes" className="sm:col-span-2"><Input name="notes" maxLength={500} placeholder="Who asked, expected dispatch…" /></Field>
              <div className="sm:col-span-2"><SubmitButton size="sm" disabled={available <= 0} pendingText="Reserving…">Reserve stock</SubmitButton></div>
            </form>
          </SectionCard>
        </div>
      )}
    </DetailPage>
  );
}
