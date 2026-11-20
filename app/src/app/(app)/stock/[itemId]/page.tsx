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
import { Badge, Card, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Select, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { adjustStock, allocateStock, issueToProject, releaseAllocation, returnFromProject } from "../actions";

const TYPE_TONE: Record<string, "green" | "red" | "blue" | "amber" | "violet" | "gray"> = {
  purchase_in: "green", opening: "green", issue_project: "violet", return: "blue", sale_out: "red", adjust: "amber",
};

export default async function StockItemPage({ params, searchParams }: { params: Promise<{ itemId: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
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

  const link = (mod: Parameters<typeof canRead>[1], href: string, text: string) => canRead(role, mod) ? <Link href={href} className="hover:underline">{text}</Link> : text;

  return (
    <div className="space-y-6">
      <PageHeader title={it.name} subtitle={<><span className="font-mono">{it.code}</span> · stock ledger</>}
        back={{ href: "/stock", label: "Stock" }}
        actions={<LinkButton href={`/items/${it.id}`} variant="secondary">Item &amp; prices</LinkButton>} />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="On hand" value={`${qty(onHand)} ${it.uom}`} />
        <Stat label="Reserved" value={`${qty(reserved)} ${it.uom}`} hint={`${allocs.filter((a) => a.a.status === "reserved").length} open allocation(s)`} />
        <Stat label="Available" value={`${qty(available)} ${it.uom}`} tone={it.reorderLevel > 0 && available <= it.reorderLevel ? "bad" : "default"}
          hint={it.reorderLevel > 0 ? `Reorder level ${qty(it.reorderLevel)}` : "No reorder level set"} />
        {seeCost ? <Stat label="Value (latest cost)" value={money(round2(Math.max(0, onHand) * cost))} hint={`@ ${money(cost)} / ${it.uom}`} />
          : <Stat label="Movements" value={moves.length} />}
      </div>

      {write && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Issue to project">
            {projList.length === 0 ? <p className="text-sm text-ink-soft">No open projects.</p> : (
              <form action={issueToProject.bind(null, it.id)} className="grid gap-3 sm:grid-cols-2">
                <Field label="Project" required className="sm:col-span-2">
                  <Select name="projectId" required defaultValue=""><option value="" disabled>Choose project…</option>
                    {projList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select>
                </Field>
                <Field label={`Qty (${it.uom})`} required hint={`On hand ${qty(onHand)}`}><Input name="qty" type="number" step="any" min={0} max={Math.max(0, onHand)} required /></Field>
                <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
                <Field label="Notes" className="sm:col-span-2"><Input name="notes" maxLength={500} placeholder="DC no., engineer…" /></Field>
                <div className="sm:col-span-2"><SubmitButton size="sm" disabled={onHand <= 0} pendingText="Issuing…">Issue{seeCost ? ` at ${money(cost)}` : ""}</SubmitButton></div>
              </form>
            )}
          </Card>
          <Card title="Return from project">
            {returnable.length === 0 ? <p className="text-sm text-ink-soft">Nothing of this item is currently issued to a project.</p> : (
              <form action={returnFromProject.bind(null, it.id)} className="grid gap-3 sm:grid-cols-2">
                <Field label="Project" required className="sm:col-span-2">
                  <Select name="projectId" required defaultValue=""><option value="" disabled>Choose project…</option>
                    {returnable.map(([pid, v]) => <option key={pid} value={pid}>{v.code}: {qty(v.net)} {it.uom} issued</option>)}</Select>
                </Field>
                <Field label={`Qty (${it.uom})`} required><Input name="qty" type="number" step="any" min={0} required /></Field>
                <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
                <Field label="Notes" className="sm:col-span-2"><Input name="notes" maxLength={500} /></Field>
                <div className="sm:col-span-2"><SubmitButton size="sm" pendingText="Saving…">Record return</SubmitButton></div>
              </form>
            )}
          </Card>
          <Card title="Adjustment / opening stock">
            <form action={adjustStock.bind(null, it.id)} className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" required>
                <Select name="kind" defaultValue={moves.length ? "adjust" : "opening"}><option value="adjust">Adjustment (+/−)</option><option value="opening">Opening stock</option></Select>
              </Field>
              <Field label={`Qty (${it.uom})`} required hint="Negative to reduce"><Input name="qty" type="number" step="any" required /></Field>
              <Field label="Date" required><Input name="date" type="date" defaultValue={today} max={today} required /></Field>
              <Field label="Reason" required><Input name="reason" required minLength={3} maxLength={500} placeholder="Physical count, damage…" /></Field>
              <div className="sm:col-span-2"><SubmitButton size="sm" pendingText="Saving…">Record</SubmitButton></div>
            </form>
          </Card>
          <Card title="Allocate (reserve) stock">
            <form action={allocateStock.bind(null, it.id)} className="grid gap-3 sm:grid-cols-2">
              <Field label={`Qty (${it.uom})`} required hint={`Available ${qty(available)}`}><Input name="qty" type="number" step="any" min={0} max={Math.max(0, available)} required /></Field>
              <Field label="Customer"><Select name="customerId" defaultValue=""><option value="">-</option>{custList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Sales order"><Select name="orderId" defaultValue=""><option value="">-</option>{orderList.map((o) => <option key={o.id} value={o.id}>{o.number}{o.customerName ? ` · ${o.customerName}` : ""}</option>)}</Select></Field>
              <Field label="Project"><Select name="projectId" defaultValue=""><option value="">-</option>{projList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select></Field>
              <Field label="Notes" className="sm:col-span-2"><Input name="notes" maxLength={500} placeholder="Who asked, expected dispatch…" /></Field>
              <div className="sm:col-span-2"><SubmitButton size="sm" disabled={available <= 0} pendingText="Reserving…">Reserve</SubmitButton></div>
            </form>
          </Card>
        </div>
      )}

      <Card title={`Allocations (${allocs.length})`} bodyClassName="p-0">
        {allocs.length === 0 ? <div className="p-4 text-sm text-ink-soft">No reservations for this item.</div> : (
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>Since</Th><Th className="text-right">Qty</Th><Th>Reserved for</Th><Th>Status</Th><Th>Notes</Th>{write && <Th><span className="sr-only">Actions</span></Th>}</tr></thead>
            <tbody>{allocs.map(({ a, customerName, orderNo, projectCode }) => (
              <tr key={a.id}>
                <Td className="text-xs">{fmtDateTime(a.createdAt)}</Td>
                <Td className="text-right tabular-nums">{qty(a.qty)}</Td>
                <Td className="text-sm">
                  {customerName && <div>{link("customers", `/customers/${a.customerId}`, customerName)}</div>}
                  {orderNo && <div className="text-xs">Order {link("orders", `/orders/${a.orderId}`, orderNo)}</div>}
                  {projectCode && <div className="text-xs">Project {link("projects", `/projects/${a.projectId}`, projectCode)}</div>}
                </Td>
                <Td><StatusBadge status={a.status === "reserved" ? "pending" : a.status === "consumed" ? "done" : "closed"} label={a.status} /></Td>
                <Td className="max-w-56 whitespace-normal text-xs">{a.notes ?? "-"}</Td>
                {write && <Td>{a.status === "reserved" && (
                  <form action={releaseAllocation.bind(null, a.id, "item")}><SubmitButton size="sm" variant="secondary" pendingText="…" confirm="Release this reservation?">Release</SubmitButton></form>
                )}</Td>}
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>

      <Card title={`Movements ledger (${moves.length})`} bodyClassName="p-0">
        {ledger.length === 0 ? <div className="p-4"><EmptyState title="No movements yet">Post a purchase invoice or record opening stock to start the ledger.</EmptyState></div> : (
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>Date</Th><Th>Type</Th><Th className="text-right">In</Th><Th className="text-right">Out</Th><Th className="text-right">Balance</Th>{seeCost && <Th className="text-right">Rate</Th>}<Th>Project / reference</Th><Th>Notes</Th><Th>By</Th></tr></thead>
            <tbody>{ledger.map(({ m, projectCode, by, balance }) => (
              <tr key={m.id}>
                <Td>{fmtDate(m.date)}</Td>
                <Td><Badge tone={TYPE_TONE[m.type] ?? "gray"}>{MOVEMENT_TYPES[m.type as MovementType] ?? m.type}</Badge></Td>
                <Td className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{m.qty > 0 ? qty(m.qty) : ""}</Td>
                <Td className="text-right tabular-nums text-red-600">{m.qty < 0 ? qty(-m.qty) : ""}</Td>
                <Td className={cx("text-right font-medium tabular-nums", balance < 0 && "text-red-600")}>{qty(balance)}</Td>
                {seeCost && <Td className="text-right tabular-nums">{money(m.rate)}</Td>}
                <Td className="text-xs">
                  {projectCode && <div>{link("projects", `/projects/${m.projectId}`, projectCode)}</div>}
                  {m.refType === "purchase_invoice" && m.refId && <div>{link("purchases", `/purchases/${m.refId}`, `PI ${piNos.get(m.refId) ?? m.refId}`)}</div>}
                </Td>
                <Td className="max-w-56 whitespace-normal text-xs">{m.notes ?? ""}</Td>
                <Td className="text-xs">{by ?? "-"}</Td>
              </tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
