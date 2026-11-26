import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { History, LineChart, Pencil, Tag, Users, Warehouse } from "lucide-react";
import { getDb } from "@/db";
import { customers, items, priceHistory, purchaseInvoices, quotationLines, quotations, vendorItems, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canSeeCost, canWrite } from "@/lib/rbac";
import { SYSTEMS } from "@/lib/constants";
import { fmtDate, marginPct, money, money0, pct, qty, todayIST } from "@/lib/format";
import {
  STALE_DAYS_DEFAULT, STALE_DAYS_VOLATILE, getPriceHistory, isPriceStale, latestCostOf, monthOverMonth, priceAgeDays,
  suggestedSupplyRate, vendorComparison, yearSummary,
} from "@/lib/items";
import { stockPositions } from "@/lib/stock";
import { Field, Flash, Input, LinkButton, cx } from "@/components/ui";
import {
  DetailPage, KeyValueGrid, MetaChip, Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, SummaryRows, Tabs, activeTab,
  type Column, type TabItem,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { PriceChart } from "../_components/price-chart";
import { updateListPrice } from "../actions";

export const metadata = { title: "Item" };

const linkCls = "text-brand-700 hover:underline dark:text-brand-300";

export default async function ItemDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; tab?: string }> }) {
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
  // only render links the viewer can open (avoid landing on /forbidden)
  const can = {
    stock: canRead(user.role, "stock"), vendors: canRead(user.role, "vendors"), purchases: canRead(user.role, "purchases"),
    customers: canRead(user.role, "customers"), quotations: canRead(user.role, "quotations"), billing: canRead(user.role, "billing"),
  };
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
    ...sales.map((s) => ({ key: `s${s.id}`, kind: "sale" as const, date: s.date, customerId: s.customerId, customerName: s.customerName, rate: Number(s.rate), qty: s.qty, href: can.billing && s.refType === "sales_invoice" && s.refId ? `/billing/invoices/${s.refId}` : null, doc: s.refType === "sales_invoice" ? "Invoice" : (s.refType ?? "-"), status: null as string | null })),
    ...quotes.map((q, i) => ({ key: `q${q.qid}-${i}`, kind: "quote" as const, date: q.date, customerId: q.customerId, customerName: q.customerName, rate: Number(q.rate), qty: q.qty, href: can.quotations ? `/quotations/${q.qid}` : null, doc: q.number, status: q.status })),
  ].filter((p) => p.rate > 0).sort((a, b) => b.date.localeCompare(a.date));

  // Last price per customer
  const byCustomer = new Map<string, { name: string; customerId: number | null; lastQuote?: { rate: number; date: string }; lastSale?: { rate: number; date: string } }>();
  for (const p of [...salesPoints].reverse()) {
    const k = String(p.customerId ?? "-");
    const e = byCustomer.get(k) ?? { name: p.customerName ?? "Unknown", customerId: p.customerId };
    if (p.kind === "quote") e.lastQuote = { rate: p.rate, date: p.date }; else e.lastSale = { rate: p.rate, date: p.date };
    byCustomer.set(k, e);
  }

  // ------------------------------------------------------------------ tabs (?tab=)
  const tabIds = ["overview", ...(seeCost ? ["purchases" as const] : []), "sales"] as const;
  const tab = activeTab(sp.tab, tabIds);
  const tabItems: TabItem[] = [
    { id: "overview", label: "Overview" },
    ...(seeCost ? [{ id: "purchases", label: "Purchase prices", count: purchases.length, alert: stale }] : []),
    { id: "sales", label: "Selling prices", count: salesPoints.length },
  ];
  const base = `/items/${it.id}`;
  const systemLabel = SYSTEMS[it.system as keyof typeof SYSTEMS] ?? it.system;
  const lowStock = it.reorderLevel > 0 && stock.available <= it.reorderLevel;
  const vendorLink = (vid: number | null | undefined, name: string | null | undefined) =>
    vid && can.vendors ? <Link href={`/vendors/${vid}`} className="hover:underline">{name}</Link> : (name ?? "-");
  const customerLink = (cid: number | null | undefined, name: string | null | undefined) =>
    cid && can.customers ? <Link href={`/customers/${cid}`} className="hover:underline">{name}</Link> : (name ?? "-");

  // ------------------------------------------------------------------ columns
  type Year = (typeof years)[number];
  const yearCols: Column<Year>[] = [
    { key: "year", header: "Year", card: "title", className: "font-medium", cell: (y) => y.year },
    { key: "min", header: "Min", align: "right", cell: (y) => money(y.min) },
    { key: "avg", header: "Avg", align: "right", cell: (y) => money(y.avg) },
    { key: "max", header: "Max", align: "right", cell: (y) => money(y.max) },
    { key: "last", header: "Last", align: "right", card: "amount", cell: (y) => money(y.last) },
    { key: "count", header: "Buys", align: "right", cell: (y) => y.count },
  ];
  type Mom = (typeof mom)[number];
  const momCols: Column<Mom>[] = [
    { key: "month", header: "Month", card: "title", nowrap: true,
      cell: (m) => new Date(m.month + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" }) },
    { key: "avg", header: "Avg rate", align: "right", card: "amount", cell: (m) => money(m.avg) },
    { key: "change", header: "Change", align: "right",
      cell: (m) => m.changePct == null ? "-" : (
        <span className={cx(m.changePct > 0 && "text-danger", m.changePct < 0 && "text-success")}>
          {m.changePct > 0 ? "+" : m.changePct < 0 ? "-" : ""}{pct(Math.abs(m.changePct))}
          <span className="sr-only">{m.changePct > 0 ? " up" : m.changePct < 0 ? " down" : ""}</span>
        </span>
      ) },
  ];
  type VRow = {
    key: string; vendorId: number | null; name: string | null; lastRate: number | null; lastDate: string | null; count: number;
    avg: number | null; diff: string; cheapest: boolean; linked: boolean;
  };
  const vendorRows: VRow[] = [
    ...vendorsCmp.map((v, i) => {
      const cheapest = vendorsCmp[0].lastRate;
      const diff = cheapest ? ((v.lastRate - cheapest) / cheapest) * 100 : 0;
      return {
        key: String(v.vendorId), vendorId: v.vendorId, name: v.vendorName, lastRate: v.lastRate, lastDate: v.lastDate, count: v.count, avg: v.avg,
        diff: i === 0 ? "-" : `+${pct(diff)}`, cheapest: i === 0 && vendorsCmp.length > 1, linked: false,
      };
    }),
    ...linkedOnly.map((v) => ({
      key: `l${v.vendorId}`, vendorId: v.vendorId, name: v.name, lastRate: v.lastRate, lastDate: v.lastDate, count: 0, avg: null, diff: "-", cheapest: false, linked: true,
    })),
  ];
  const vendorCols: Column<VRow>[] = [
    { key: "vendor", header: "Vendor", card: "title",
      cell: (v) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {vendorLink(v.vendorId, v.name)}
          {v.cheapest && <StatusPill semantic="success" label="Cheapest" noDot />}
          {v.linked && <StatusPill semantic="neutral" label="Linked" noDot />}
        </span>
      ) },
    { key: "last", header: "Last rate", align: "right", card: "amount", cell: (v) => money(v.lastRate) },
    { key: "date", header: "Last bought", nowrap: true, cell: (v) => fmtDate(v.lastDate) },
    { key: "count", header: "Buys", align: "right", cell: (v) => v.count },
    { key: "avg", header: "Avg rate", align: "right", cell: (v) => (v.avg == null ? "-" : money(v.avg)) },
    { key: "diff", header: "Above cheapest", align: "right", cell: (v) => v.diff },
  ];
  const purchaseRows = [...purchases].reverse().map((p, i, arr) => {
    const prev = arr[i + 1];
    return { p, ch: prev && prev.rate ? ((p.rate - prev.rate) / prev.rate) * 100 : null };
  });
  type PRow = (typeof purchaseRows)[number];
  const purchaseCols: Column<PRow>[] = [
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: ({ p }) => fmtDate(p.date) },
    { key: "vendor", header: "Vendor", card: "title", cell: ({ p }) => (p.vendorId ? vendorLink(p.vendorId, p.vendorName) : "-") },
    { key: "invoice", header: "Invoice", nowrap: true,
      cell: ({ p }) => p.refType === "purchase_invoice" && p.refId
        ? (can.purchases ? <Link href={`/purchases/${p.refId}`} className={linkCls}>{invNos.get(p.refId) ?? `#${p.refId}`}</Link> : (invNos.get(p.refId) ?? `#${p.refId}`))
        : "-" },
    { key: "qty", header: "Qty", align: "right", cell: ({ p }) => qty(p.qty) },
    { key: "rate", header: "Rate", align: "right", card: "amount", cell: ({ p }) => money(p.rate) },
    { key: "change", header: "Change", align: "right",
      cell: ({ ch }) => ch == null ? "-" : (
        <span className={cx("text-caption", Math.abs(ch) >= 5 && (ch > 0 ? "font-semibold text-danger" : "font-semibold text-success"))}>{`${ch > 0 ? "+" : ""}${pct(ch)}`}</span>
      ) },
  ];
  const customerRows = [...byCustomer.values()];
  type CRow = (typeof customerRows)[number];
  const customerCols: Column<CRow>[] = [
    { key: "customer", header: "Customer", card: "title", cell: (c) => customerLink(c.customerId, c.name) },
    { key: "quoted", header: "Last quoted", align: "right",
      cell: (c) => c.lastQuote ? <>{money(c.lastQuote.rate)}<div className="text-caption text-ink-faint">{fmtDate(c.lastQuote.date)}</div></> : "-" },
    { key: "sold", header: "Last sold", align: "right", card: "amount",
      cell: (c) => c.lastSale ? <>{money(c.lastSale.rate)}<div className="text-caption text-ink-faint">{fmtDate(c.lastSale.date)}</div></> : "-" },
    ...(seeCost ? [{ key: "margin", header: "Margin (sold)", align: "right" as const,
      cell: (c: CRow) => (c.lastSale && cost.rate ? pct(marginPct(c.lastSale.rate, cost.rate)) : "-") }] : []),
  ];
  type SRow = (typeof salesPoints)[number];
  const salesCols: Column<SRow>[] = [
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (p) => fmtDate(p.date) },
    { key: "type", header: "Type", card: "badge",
      cell: (p) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <StatusPill semantic={p.kind === "sale" ? "success" : "info"} label={p.kind === "sale" ? "Sale" : "Quote"} noDot />
          {p.status && <StatusPill status={p.status} />}
        </span>
      ) },
    { key: "customer", header: "Customer", card: "title", cell: (p) => customerLink(p.customerId, p.customerName) },
    { key: "doc", header: "Document", nowrap: true, cell: (p) => (p.href ? <Link href={p.href} className={linkCls}>{p.doc}</Link> : p.doc) },
    { key: "qty", header: "Qty", align: "right", cell: (p) => qty(p.qty) },
    { key: "rate", header: "Rate", align: "right", card: "amount", cell: (p) => money(p.rate) },
    ...(seeCost ? [{ key: "margin", header: "Margin vs latest cost", align: "right" as const,
      cell: (p: SRow) => { const m = cost.rate ? marginPct(p.rate, cost.rate) : null; return <span className={cx(m != null && m < 10 && "text-danger")}>{m == null ? "-" : pct(m)}</span>; } }] : []),
  ];

  return (
    <DetailPage
      back={{ href: "/items", label: "Item and price master" }}
      eyebrow="Item"
      title={it.name}
      status={!it.active ? <StatusPill status="inactive" /> : undefined}
      meta={
        <>
          <MetaChip label="Code"><span className="font-mono">{it.code}</span></MetaChip>
          <MetaChip label="System">{systemLabel}</MetaChip>
          <MetaChip label="Group">{it.groupName}</MetaChip>
          {it.size && <MetaChip label="Size">{it.size}</MetaChip>}
          <MetaChip label="UOM">{it.uom}</MetaChip>
        </>
      }
      primaryAction={write && <LinkButton href={`/items/${it.id}/edit`}><Pencil className="icon-sm" aria-hidden /> Edit item</LinkButton>}
      secondaryActions={can.stock ? <LinkButton href={`/stock/${it.id}`} variant="secondary"><Warehouse className="icon-sm" aria-hidden /> Stock ledger</LinkButton> : undefined}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      tabs={<Tabs label="Item sections" basePath={base} params={{ tab: sp.tab }} active={tab} items={tabItems} />}
      aside={
        <>
          <SectionCard title="Price summary" icon={Tag}>
            <SummaryRows rows={[
              ...(seeCost ? [["Latest cost", money(cost.rate)] as [string, string]] : []),
              ["Suggested sell", money(sell)],
              ["Last sale rate", money(it.lastSaleRate)],
              ["Stock available", <span key="a" className={cx(lowStock && "text-danger")}>{qty(stock.available)} {it.uom}</span>],
            ]} />
            {!seeCost && <p className="mt-3 text-caption text-ink-soft">Buying prices and margins are hidden for your role. Suggested selling rate: {money0(sell)}.</p>}
          </SectionCard>
          {seeCost && (
            <SectionCard title="List price" description="Only used until a purchase invoice sets the latest cost. Updating it records a list price point.">
              {write ? (
                <form action={updateListPrice.bind(null, it.id)} className="space-y-3">
                  <Field label="New list price (₹)" required>
                    <Input name="listPrice" type="number" inputMode="decimal" step="0.01" min={0.01} required defaultValue={it.listPrice ?? ""} className="text-right" />
                  </Field>
                  <Field label="Effective date">
                    <Input name="date" type="date" defaultValue={today} max={today} />
                  </Field>
                  <SubmitButton size="sm" pendingText="Saving…">Update list price</SubmitButton>
                </form>
              ) : <p className="text-heading text-ink">{money(it.listPrice)}</p>}
              {listHist.length > 0 && (
                <SummaryRows className="mt-4 border-t border-line pt-3" rows={[...listHist].reverse().slice(0, 5).map((p) => [fmtDate(p.date), money(p.rate)] as [string, string])} />
              )}
            </SectionCard>
          )}
        </>
      }
    >
      {tab === "overview" && (
        <>
          <MetricStrip>
            {seeCost && (
              <Metric label="Latest cost" value={money(cost.rate)} tone={cost.source !== "purchase" || stale ? "warn" : "default"}
                hint={cost.source === "purchase"
                  ? <>{fmtDate(cost.date)} · {row.vendorName ?? "-"} · {age}d old{stale && ` (stale after ${it.volatilePrice ? STALE_DAYS_VOLATILE : STALE_DAYS_DEFAULT}d)`}</>
                  : cost.source === "list" ? "From list price (no purchase yet)" : "No price available"} />
            )}
            <Metric label="Suggested sell" value={money(sell)} hint={seeCost ? `Cost plus ${pct(it.markupPct, 0)} markup` : `Per ${it.uom}`} />
            <Metric label="Last sale rate" value={money(it.lastSaleRate)}
              hint={it.lastSaleRate != null ? <>{fmtDate(it.lastSaleDate)}{seeCost && cost.rate ? ` · margin ${pct(marginPct(it.lastSaleRate, cost.rate))}` : ""}</> : "Not sold yet"} />
            <Metric label="Stock available" value={`${qty(stock.available)} ${it.uom}`} href={can.stock ? `/stock/${it.id}` : undefined}
              tone={lowStock ? "bad" : "default"}
              hint={`On hand ${qty(stock.onHand)} · reserved ${qty(stock.reserved)}${it.reorderLevel > 0 ? ` · reorder at ${qty(it.reorderLevel)}` : ""}`} />
          </MetricStrip>
          <SectionCard title="Item details">
            <KeyValueGrid columns={3} items={[
              ["Size", it.size], ["Make", it.make], ["UOM", it.uom], ["HSN", it.hsn], ["GST", pct(it.gstRate, 0)],
              ["Erection rate", seeCost || it.erectionRate ? money(it.erectionRate) : null],
              ...(seeCost ? [["List price", money(it.listPrice)] as [string, string], ["Default markup", pct(it.markupPct, 0)] as [string, string]] : []),
              ["Volatile price", it.volatilePrice ? `Yes, stale after ${STALE_DAYS_VOLATILE} days` : `No, stale after ${STALE_DAYS_DEFAULT} days`],
              { label: "Description", value: it.description, wide: true },
            ]} />
          </SectionCard>
        </>
      )}

      {tab === "purchases" && seeCost && (
        <>
          <SectionCard title="Purchase rate over time" icon={LineChart}
            description="Each point is a posted purchase invoice. The purchase history table below lists the same numbers."
            empty={purchases.length === 0 && "No purchase prices yet. Post a purchase invoice to start the history."}>
            <PriceChart points={purchases.map((p) => ({ date: p.date, rate: p.rate, label: p.vendorName ?? undefined }))} />
          </SectionCard>
          {purchases.length > 0 && (
            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard title="Year-wise summary" flush>
                <ResponsiveTable flush rows={years} columns={yearCols} rowKey={(y) => y.year} caption="Year-wise purchase summary" />
              </SectionCard>
              <SectionCard title="Month on month" description="Last 12 months with purchases" flush>
                <ResponsiveTable flush rows={mom} columns={momCols} rowKey={(m) => m.month} caption="Month on month purchase rate" />
              </SectionCard>
            </div>
          )}
          <SectionCard title="Vendor comparison" icon={Users} count={vendorRows.length} flush
            empty={vendorRows.length === 0 && "No suppliers yet. Vendors appear here when a purchase invoice for this item is posted."}>
            <ResponsiveTable flush rows={vendorRows} columns={vendorCols} rowKey={(v) => v.key} caption="Vendor comparison" />
          </SectionCard>
          <SectionCard title="Purchase history" icon={History} count={purchases.length} flush
            empty={purchases.length === 0 && "No purchases yet. Purchases appear here once an invoice for this item is posted."}>
            <ResponsiveTable flush rows={purchaseRows} columns={purchaseCols} rowKey={(r) => r.p.id} caption="Purchase history" />
          </SectionCard>
        </>
      )}

      {tab === "sales" && (
        <>
          <SectionCard title="Last price by customer" icon={Users} count={customerRows.length} flush
            description={`Quoted and invoiced selling rates, kept separate from purchase prices.${seeCost ? " Margin is against today's latest cost." : ""}`}
            empty={salesPoints.length === 0 && "Not quoted or sold yet. Selling rates appear here once this item is used in a quotation or sales invoice."}>
            <ResponsiveTable flush rows={customerRows} columns={customerCols} rowKey={(c) => String(c.customerId)} caption="Last price by customer" />
          </SectionCard>
          {salesPoints.length > 0 && (
            <SectionCard title="All selling price points" count={salesPoints.length} flush>
              <ResponsiveTable flush rows={salesPoints} columns={salesCols} rowKey={(p) => p.key} caption="Selling price points" />
            </SectionCard>
          )}
        </>
      )}
    </DetailPage>
  );
}
