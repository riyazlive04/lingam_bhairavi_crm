import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Pencil, Warehouse } from "lucide-react";
import { getDb } from "@/db";
import { customers, items, priceHistory, purchaseInvoices, quotationLines, quotations, vendorItems, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canSeeCost, canWrite } from "@/lib/rbac";
import { SYSTEMS } from "@/lib/constants";
import { fmtDate, marginPct, money, money0, pct, qty, todayIST } from "@/lib/format";
import {
  STALE_DAYS_DEFAULT, STALE_DAYS_VOLATILE, getPriceHistory, isPriceStale, latestCostOf, monthOverMonth, priceAgeDays,
  suggestedSupplyRate, vendorComparison, yearSummary,
} from "@/lib/items";
import { stockPositions } from "@/lib/stock";
import { Badge, Card, DL, EmptyState, Field, Flash, Input, LinkButton, PageHeader, StatusBadge, Stat, Table, Td, Th, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PriceChart } from "../_components/price-chart";
import { updateListPrice } from "../actions";

export default async function ItemDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("items");
  const { id } = await params;
  const sp = await searchParams;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) notFound();
  const db = await getDb();
  const [row] = await db.select({ it: items, vendorName: vendors.name }).from(items)
    .leftJoin(vendors, eq(vendors.id, items.lastPurchaseVendorId)).where(eq(items.id, itemId));
  if (!row) notFound();
  const it = row.it;
  const seeCost = canSeeCost(user.role);
  const write = canWrite(user.role, "items");
  const today = todayIST();
  const cost = latestCostOf(it);
  const sell = suggestedSupplyRate(cost.rate, it.markupPct);
  const age = priceAgeDays(it.lastPurchaseDate, today);
  const stale = isPriceStale(it, today);

  const [purchases, listHist, sales, quotes, linkedVendors, pos] = await Promise.all([
    seeCost ? getPriceHistory(db, itemId, ["purchase"]) : Promise.resolve([]),
    seeCost ? getPriceHistory(db, itemId, ["list"]) : Promise.resolve([]),
    db.select({ id: priceHistory.id, rate: priceHistory.rate, date: priceHistory.date, qty: priceHistory.qty, refType: priceHistory.refType, refId: priceHistory.refId, customerId: priceHistory.customerId, customerName: customers.name })
      .from(priceHistory).leftJoin(customers, eq(customers.id, priceHistory.customerId))
      .where(and(eq(priceHistory.itemId, itemId), eq(priceHistory.kind, "sale")))
      .orderBy(desc(priceHistory.date), desc(priceHistory.id)).limit(100),
    db.select({ qid: quotations.id, number: quotations.number, date: quotations.quoteDate, status: quotations.status, customerId: quotations.customerId, customerName: customers.name, rate: quotationLines.supplyRate, qty: quotationLines.qty })
      .from(quotationLines).innerJoin(quotations, eq(quotations.id, quotationLines.quotationId)).leftJoin(customers, eq(customers.id, quotations.customerId))
      .where(eq(quotationLines.itemId, itemId))
      .orderBy(desc(quotations.quoteDate), desc(quotations.id)).limit(100),
    seeCost
      ? db.select({ vendorId: vendorItems.vendorId, name: vendors.name, lastRate: vendorItems.lastRate, lastDate: vendorItems.lastDate, leadTimeDays: vendorItems.leadTimeDays })
        .from(vendorItems).innerJoin(vendors, eq(vendors.id, vendorItems.vendorId)).where(eq(vendorItems.itemId, itemId))
      : Promise.resolve([]),
    stockPositions(db, [itemId]),
  ]);
  const stock = pos.get(itemId) ?? { onHand: 0, reserved: 0, available: 0 };

  const invIds = [...new Set(purchases.filter((p) => p.refType === "purchase_invoice" && p.refId).map((p) => p.refId!))];
  const invNos = new Map(invIds.length
    ? (await db.select({ id: purchaseInvoices.id, no: purchaseInvoices.invoiceNo }).from(purchaseInvoices).where(inArray(purchaseInvoices.id, invIds))).map((r) => [r.id, r.no])
    : []);

  const years = yearSummary(purchases);
  const mom = monthOverMonth(purchases).slice(0, 12);
  const vendorsCmp = vendorComparison(purchases);
  const histVendorIds = new Set(vendorsCmp.map((v) => v.vendorId));
  const linkedOnly = linkedVendors.filter((v) => !histVendorIds.has(v.vendorId));

  // Combined sales-side points (quote + sale), newest first
  const salesPoints = [
    ...sales.map((s) => ({ key: `s${s.id}`, kind: "sale" as const, date: s.date, customerId: s.customerId, customerName: s.customerName, rate: Number(s.rate), qty: s.qty, href: s.refType === "sales_invoice" && s.refId ? `/billing/invoices/${s.refId}` : null, doc: s.refType === "sales_invoice" ? "Invoice" : (s.refType ?? "—"), status: null as string | null })),
    ...quotes.map((q, i) => ({ key: `q${q.qid}-${i}`, kind: "quote" as const, date: q.date, customerId: q.customerId, customerName: q.customerName, rate: Number(q.rate), qty: q.qty, href: `/quotations/${q.qid}`, doc: q.number, status: q.status })),
  ].filter((p) => p.rate > 0).sort((a, b) => b.date.localeCompare(a.date));

  // Last price per customer
  const byCustomer = new Map<string, { name: string; customerId: number | null; lastQuote?: { rate: number; date: string }; lastSale?: { rate: number; date: string } }>();
  for (const p of [...salesPoints].reverse()) {
    const k = String(p.customerId ?? "—");
    const e = byCustomer.get(k) ?? { name: p.customerName ?? "Unknown", customerId: p.customerId };
    if (p.kind === "quote") e.lastQuote = { rate: p.rate, date: p.date }; else e.lastSale = { rate: p.rate, date: p.date };
    byCustomer.set(k, e);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={it.name}
        subtitle={<>
          <span className="font-mono">{it.code}</span> · {SYSTEMS[it.system as keyof typeof SYSTEMS] ?? it.system} · {it.groupName}
          {!it.active && <> · <Badge tone="gray">inactive</Badge></>}
        </>}
        back={{ href: "/items", label: "Item & Price Master" }}
        actions={<>
          <LinkButton href={`/stock/${it.id}`} variant="secondary"><Warehouse size={16} aria-hidden /> Stock ledger</LinkButton>
          {write && <LinkButton href={`/items/${it.id}/edit`}><Pencil size={16} aria-hidden /> Edit</LinkButton>}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {seeCost && (
          <Stat label="Latest cost" value={money(cost.rate)} tone={cost.source !== "purchase" || stale ? "warn" : "default"}
            hint={cost.source === "purchase"
              ? <>{fmtDate(cost.date)} · {row.vendorName ?? "—"} · {age}d old{stale && ` (stale > ${it.volatilePrice ? STALE_DAYS_VOLATILE : STALE_DAYS_DEFAULT}d)`}</>
              : cost.source === "list" ? "From list price — no purchase yet" : "No price available"} />
        )}
        <Stat label="Suggested sell" value={money(sell)} hint={seeCost ? `Cost + ${pct(it.markupPct, 0)} markup` : `Per ${it.uom}`} />
        <Stat label="Last sale rate" value={money(it.lastSaleRate)}
          hint={it.lastSaleRate != null ? <>{fmtDate(it.lastSaleDate)}{seeCost && cost.rate ? ` · margin ${pct(marginPct(it.lastSaleRate, cost.rate))}` : ""}</> : "Not sold yet"} />
        <Stat label="Stock available" value={`${qty(stock.available)} ${it.uom}`} href={`/stock/${it.id}`}
          tone={it.reorderLevel > 0 && stock.available <= it.reorderLevel ? "bad" : "default"}
          hint={`On hand ${qty(stock.onHand)} · reserved ${qty(stock.reserved)}${it.reorderLevel > 0 ? ` · reorder at ${qty(it.reorderLevel)}` : ""}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <DL items={[
            ["Size", it.size], ["Make", it.make], ["UOM", it.uom], ["HSN", it.hsn], ["GST", pct(it.gstRate, 0)],
            ["Erection rate", seeCost || it.erectionRate ? money(it.erectionRate) : null],
            ...(seeCost ? [["List price", money(it.listPrice)] as [string, string], ["Default markup", pct(it.markupPct, 0)] as [string, string]] : []),
            ["Volatile price", it.volatilePrice ? `Yes — stale after ${STALE_DAYS_VOLATILE} days` : `No — stale after ${STALE_DAYS_DEFAULT} days`],
            ["Description", it.description],
          ]} />
        </Card>
        {seeCost && (
          <Card title="List price">
            <p className="mb-3 text-sm text-ink-soft">The list price is only used until a purchase invoice sets the latest cost. Updating it records a <Badge>list</Badge> price point.</p>
            {write ? (
              <form action={updateListPrice.bind(null, it.id)} className="space-y-3">
                <Field label="New list price (₹)" required>
                  <Input name="listPrice" type="number" step="0.01" min={0.01} required defaultValue={it.listPrice ?? ""} />
                </Field>
                <Field label="Effective date">
                  <Input name="date" type="date" defaultValue={today} max={today} />
                </Field>
                <SubmitButton size="sm">Update list price</SubmitButton>
              </form>
            ) : <p className="text-lg font-semibold">{money(it.listPrice)}</p>}
            {listHist.length > 0 && (
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                {[...listHist].reverse().slice(0, 5).map((p) => (
                  <li key={p.id} className="flex justify-between"><span className="text-ink-soft">{fmtDate(p.date)}</span><span className="tabular-nums">{money(p.rate)}</span></li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {seeCost && (
        <section aria-labelledby="ph" className="space-y-4">
          <h2 id="ph" className="text-lg font-semibold text-ink">Purchase price history</h2>
          <Card title="Purchase rate over time"><PriceChart points={purchases.map((p) => ({ date: p.date, rate: p.rate, label: p.vendorName ?? undefined }))} /></Card>
          {purchases.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Year-wise summary" bodyClassName="p-0">
                <Table className="rounded-none border-0 shadow-none">
                  <thead><tr><Th>Year</Th><Th className="text-right">Min</Th><Th className="text-right">Avg</Th><Th className="text-right">Max</Th><Th className="text-right">Last</Th><Th className="text-right">Buys</Th></tr></thead>
                  <tbody>{years.map((y) => (
                    <tr key={y.year}><Td className="font-medium">{y.year}</Td><Td className="text-right tabular-nums">{money(y.min)}</Td><Td className="text-right tabular-nums">{money(y.avg)}</Td>
                      <Td className="text-right tabular-nums">{money(y.max)}</Td><Td className="text-right tabular-nums">{money(y.last)}</Td><Td className="text-right">{y.count}</Td></tr>
                  ))}</tbody>
                </Table>
              </Card>
              <Card title="Month-over-month (last 12 months with purchases)" bodyClassName="p-0">
                <Table className="rounded-none border-0 shadow-none">
                  <thead><tr><Th>Month</Th><Th className="text-right">Avg rate</Th><Th className="text-right">Change</Th></tr></thead>
                  <tbody>{mom.map((m) => (
                    <tr key={m.month}><Td>{new Date(m.month + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</Td>
                      <Td className="text-right tabular-nums">{money(m.avg)}</Td>
                      <Td className={cx("text-right tabular-nums", m.changePct != null && m.changePct > 0 && "text-red-600", m.changePct != null && m.changePct < 0 && "text-emerald-600")}>
                        {m.changePct == null ? "—" : `${m.changePct > 0 ? "▲" : m.changePct < 0 ? "▼" : ""} ${pct(Math.abs(m.changePct))}`}</Td></tr>
                  ))}</tbody>
                </Table>
              </Card>
            </div>
          )}
          <Card title="Vendor comparison" bodyClassName="p-0">
            {vendorsCmp.length + linkedOnly.length === 0 ? <div className="p-4"><EmptyState title="No suppliers yet">Vendors appear here automatically when a purchase invoice for this item is posted.</EmptyState></div> : (
              <Table className="rounded-none border-0 shadow-none">
                <thead><tr><Th>Vendor</Th><Th className="text-right">Last rate</Th><Th>Last bought</Th><Th className="text-right">Buys</Th><Th className="text-right">Avg rate</Th><Th className="text-right">vs cheapest</Th></tr></thead>
                <tbody>
                  {vendorsCmp.map((v, i) => {
                    const cheapest = vendorsCmp[0].lastRate;
                    const diff = cheapest ? ((v.lastRate - cheapest) / cheapest) * 100 : 0;
                    return (
                      <tr key={String(v.vendorId)}>
                        <Td>{v.vendorId ? <Link href={`/vendors/${v.vendorId}`} className="hover:underline">{v.vendorName}</Link> : v.vendorName}{i === 0 && vendorsCmp.length > 1 && <> <Badge tone="green">cheapest</Badge></>}</Td>
                        <Td className="text-right tabular-nums">{money(v.lastRate)}</Td><Td>{fmtDate(v.lastDate)}</Td><Td className="text-right">{v.count}</Td>
                        <Td className="text-right tabular-nums">{money(v.avg)}</Td><Td className="text-right tabular-nums">{i === 0 ? "—" : `+${pct(diff)}`}</Td>
                      </tr>
                    );
                  })}
                  {linkedOnly.map((v) => (
                    <tr key={`l${v.vendorId}`}>
                      <Td><Link href={`/vendors/${v.vendorId}`} className="hover:underline">{v.name}</Link> <Badge>linked</Badge></Td>
                      <Td className="text-right tabular-nums">{money(v.lastRate)}</Td><Td>{fmtDate(v.lastDate)}</Td><Td className="text-right">0</Td><Td className="text-right">—</Td><Td className="text-right">—</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card title={`Purchase history (${purchases.length})`} bodyClassName="p-0">
            {purchases.length === 0 ? <div className="p-4 text-sm text-ink-soft">No purchases recorded.</div> : (
              <Table className="rounded-none border-0 shadow-none">
                <thead><tr><Th>Date</Th><Th>Vendor</Th><Th>Invoice</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th><Th className="text-right">Change</Th></tr></thead>
                <tbody>
                  {[...purchases].reverse().map((p, i, arr) => {
                    const prev = arr[i + 1];
                    const ch = prev && prev.rate ? ((p.rate - prev.rate) / prev.rate) * 100 : null;
                    return (
                      <tr key={p.id}>
                        <Td>{fmtDate(p.date)}</Td>
                        <Td>{p.vendorId ? <Link href={`/vendors/${p.vendorId}`} className="hover:underline">{p.vendorName}</Link> : "—"}</Td>
                        <Td>{p.refType === "purchase_invoice" && p.refId ? <Link href={`/purchases/${p.refId}`} className="text-brand-700 hover:underline dark:text-brand-300">{invNos.get(p.refId) ?? `#${p.refId}`}</Link> : "—"}</Td>
                        <Td className="text-right tabular-nums">{qty(p.qty)}</Td>
                        <Td className="text-right tabular-nums">{money(p.rate)}</Td>
                        <Td className={cx("text-right tabular-nums text-xs", ch != null && Math.abs(ch) >= 5 && (ch > 0 ? "font-semibold text-red-600" : "font-semibold text-emerald-600"))}>
                          {ch == null ? "—" : `${ch > 0 ? "+" : ""}${pct(ch)}`}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </section>
      )}

      <section aria-labelledby="sh" className="space-y-4">
        <div>
          <h2 id="sh" className="text-lg font-semibold text-ink">Sales price history</h2>
          <p className="text-sm text-ink-soft">Quoted and invoiced selling rates to customers — kept separate from purchase prices.{seeCost && " Margin is against today's latest cost."}</p>
        </div>
        {salesPoints.length === 0 ? <EmptyState title="Not quoted or sold yet">Selling rates appear here once this item is used in a quotation or sales invoice.</EmptyState> : (
          <>
            <Card title="Last price by customer" bodyClassName="p-0">
              <Table className="rounded-none border-0 shadow-none">
                <thead><tr><Th>Customer</Th><Th className="text-right">Last quoted</Th><Th className="text-right">Last sold</Th>{seeCost && <Th className="text-right">Margin (sold)</Th>}</tr></thead>
                <tbody>{[...byCustomer.values()].map((c) => (
                  <tr key={String(c.customerId)}>
                    <Td>{c.customerId ? <Link href={`/customers/${c.customerId}`} className="hover:underline">{c.name}</Link> : c.name}</Td>
                    <Td className="text-right tabular-nums">{c.lastQuote ? <>{money(c.lastQuote.rate)}<div className="text-xs text-ink-faint">{fmtDate(c.lastQuote.date)}</div></> : "—"}</Td>
                    <Td className="text-right tabular-nums">{c.lastSale ? <>{money(c.lastSale.rate)}<div className="text-xs text-ink-faint">{fmtDate(c.lastSale.date)}</div></> : "—"}</Td>
                    {seeCost && <Td className="text-right tabular-nums">{c.lastSale && cost.rate ? pct(marginPct(c.lastSale.rate, cost.rate)) : "—"}</Td>}
                  </tr>
                ))}</tbody>
              </Table>
            </Card>
            <Card title={`All selling price points (${salesPoints.length})`} bodyClassName="p-0">
              <Table className="rounded-none border-0 shadow-none">
                <thead><tr><Th>Date</Th><Th>Type</Th><Th>Customer</Th><Th>Document</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th>{seeCost && <Th className="text-right">Margin vs latest cost</Th>}</tr></thead>
                <tbody>{salesPoints.map((p) => {
                  const m = cost.rate ? marginPct(p.rate, cost.rate) : null;
                  return (
                    <tr key={p.key}>
                      <Td>{fmtDate(p.date)}</Td>
                      <Td><Badge tone={p.kind === "sale" ? "green" : "blue"}>{p.kind}</Badge>{p.status && <> <StatusBadge status={p.status} /></>}</Td>
                      <Td>{p.customerId ? <Link href={`/customers/${p.customerId}`} className="hover:underline">{p.customerName}</Link> : (p.customerName ?? "—")}</Td>
                      <Td>{p.href ? <Link href={p.href} className="text-brand-700 hover:underline dark:text-brand-300">{p.doc}</Link> : p.doc}</Td>
                      <Td className="text-right tabular-nums">{qty(p.qty)}</Td>
                      <Td className="text-right tabular-nums">{money(p.rate)}</Td>
                      {seeCost && <Td className={cx("text-right tabular-nums", m != null && m < 10 && "text-red-600")}>{m == null ? "—" : pct(m)}</Td>}
                    </tr>
                  );
                })}</tbody>
              </Table>
            </Card>
          </>
        )}
      </section>
      {!seeCost && <p className="text-xs text-ink-faint">Buying prices and margins are hidden for your role. Suggested selling rate: {money0(sell)}.</p>}
    </div>
  );
}
