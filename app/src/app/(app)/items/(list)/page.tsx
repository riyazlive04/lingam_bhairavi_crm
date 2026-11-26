import type { ReactNode } from "react";
import Link from "next/link";
import { and, asc, count, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Download, Plus } from "lucide-react";
import { getDb } from "@/db";
import { items, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canSeeCost, canWrite } from "@/lib/rbac";
import { SYSTEMS } from "@/lib/constants";
import { fmtDate, money, money0, pct, todayIST, addDays } from "@/lib/format";
import { NB_SIZES, STALE_DAYS_DEFAULT, STALE_DAYS_VOLATILE, isPriceStale, latestCostOf, normaliseNB, priceAgeDays, suggestedSupplyRate } from "@/lib/items";
import { EmptyState, Flash, LinkButton, Select, Table, Td, Th, buttonClass, cx } from "@/components/ui";
import { qs, withParams, type QueryParams } from "@/lib/url";
import {
  FilterPills, ListEmpty, ListFilters, ListPage, Pagination, ResponsiveTable, SectionCard, StatusPill, Tabs,
  type Column,
} from "@/components/patterns";

export const metadata = { title: "Item and price master" };

const PAGE_SIZE = 100;
/** Non-NB items listed under the size matrix (the item list has the rest). */
const OTHERS_LIMIT = 40;

type SP = { q?: string; system?: string; group?: string; make?: string; stale?: string; view?: string; basis?: string; page?: string; ok?: string; err?: string };

const itemsHref = (params: QueryParams) => withParams("/items", params);

const linkCls = "text-brand-700 hover:underline dark:text-brand-300";

export default async function ItemsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("items");
  const sp = await searchParams;
  const db = await getDb();
  const seeCost = canSeeCost(user.role);
  const write = canWrite(user.role, "items");
  const today = todayIST();
  const view = sp.view === "matrix" ? "matrix" : "list";
  const system = sp.system && sp.system in SYSTEMS ? sp.system : "";

  const conds: (SQL | undefined)[] = [eq(items.active, true)];
  if (system) conds.push(eq(items.system, system));
  if (sp.group) conds.push(eq(items.groupName, sp.group));
  if (sp.make) conds.push(eq(items.make, sp.make));
  if (sp.q) {
    const like = `%${sp.q.trim()}%`;
    conds.push(or(ilike(items.code, like), ilike(items.name, like), ilike(items.size, like), ilike(items.groupName, like), ilike(items.make, like)));
  }
  if (sp.stale === "1") {
    conds.push(sql`(${items.lastPurchaseDate} is null or (${items.volatilePrice} and ${items.lastPurchaseDate} < ${addDays(today, -STALE_DAYS_VOLATILE)}) or (not ${items.volatilePrice} and ${items.lastPurchaseDate} < ${addDays(today, -STALE_DAYS_DEFAULT)}))`);
  }
  const where = and(...conds);

  const groupConds = system ? eq(items.system, system) : undefined;
  const [groups, makes] = await Promise.all([
    db.selectDistinct({ g: items.groupName }).from(items).where(and(eq(items.active, true), groupConds)).orderBy(asc(items.groupName)),
    db.selectDistinct({ m: items.make }).from(items).where(and(eq(items.active, true), groupConds, sql`${items.make} is not null`)).orderBy(asc(items.make)),
  ]);

  const base = { q: sp.q, system, group: sp.group, make: sp.make, stale: sp.stale };
  const activeFilters = [sp.q?.trim(), system, sp.group, sp.make].filter(Boolean).length;
  const clearHref = itemsHref({ view: view === "matrix" ? "matrix" : undefined, stale: view === "list" ? sp.stale : undefined });

  const tabs = (
    <Tabs label="Item views" active={view} items={[
      { id: "list", label: "Item list", href: itemsHref({ ...base }) },
      { id: "matrix", label: "Price master (size matrix)", href: itemsHref({ ...base, view: "matrix" }) },
    ]} />
  );
  const filters = (
    <>
      {view === "list" && (
        <FilterPills label="Filter by price age" items={[
          { label: "All items", href: itemsHref({ ...base, stale: undefined }), active: sp.stale !== "1" },
          { label: "Stale prices only", href: itemsHref({ ...base, stale: "1" }), active: sp.stale === "1" },
        ]} />
      )}
      <ListFilters q={sp.q} placeholder="Search code, name, size, make" clearHref={clearHref} activeCount={activeFilters}
        hidden={{ view: view === "matrix" ? "matrix" : undefined, stale: view === "list" ? sp.stale : undefined, basis: view === "matrix" ? sp.basis : undefined }}>
        <Select name="system" defaultValue={system} aria-label="System">
          <option value="">All systems</option>
          {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="group" defaultValue={sp.group ?? ""} aria-label="Group">
          <option value="">All groups</option>
          {groups.map((g) => <option key={g.g} value={g.g}>{g.g}</option>)}
        </Select>
        <Select name="make" defaultValue={sp.make ?? ""} aria-label="Make">
          <option value="">All makes</option>
          {makes.map((m) => m.m && <option key={m.m} value={m.m}>{m.m}</option>)}
        </Select>
      </ListFilters>
    </>
  );

  const header = {
    title: "Item and price master",
    subtitle: "Latest cost is picked up from posted supplier invoices, so you never have to re-check prices for each quotation.",
    secondaryActions: (
      <a href={"/items/export" + qs({ system, group: sp.group, make: sp.make, q: sp.q })} className={buttonClass("secondary")}>
        <Download className="icon-sm" aria-hidden /> Download Excel
      </a>
    ),
    primaryAction: write && <LinkButton href="/items/new"><Plus className="icon-sm" aria-hidden /> New item</LinkButton>,
    tabs,
    notices: <Flash ok={sp.ok} err={sp.err} />,
    filters,
  };

  if (view === "matrix") {
    return <PriceMatrix header={header} where={where} seeCost={seeCost} basis={seeCost && sp.basis !== "sell" ? "cost" : "sell"} base={base} />;
  }

  // ------------------------------------------------------------------ item list
  const page = Math.max(1, Number(sp.page) || 1);
  const [[{ n }], rows] = await Promise.all([
    db.select({ n: count() }).from(items).where(where),
    db
      .select({ it: items, vendorName: vendors.name })
      .from(items)
      .leftJoin(vendors, eq(vendors.id, items.lastPurchaseVendorId))
      .where(where)
      .orderBy(asc(items.system), asc(items.groupName), asc(items.code))
      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
  ]);
  const total = Number(n);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "code", header: "Code", card: "title", nowrap: true,
      cell: ({ it }) => <Link href={`/items/${it.id}`} className={cx("rt-stretch font-mono text-xs font-medium", linkCls)}>{it.code}</Link> },
    { key: "item", header: "Item", card: "subtitle", className: "max-w-72 whitespace-normal",
      cell: ({ it }) => (
        <>
          <div className="font-medium text-ink">{it.name}</div>
          <div className="text-caption text-ink-faint">{SYSTEMS[it.system as keyof typeof SYSTEMS] ?? it.system} · {it.groupName}</div>
        </>
      ) },
    { key: "size", header: "Size", nowrap: true, cell: ({ it }) => it.size ?? "-" },
    { key: "make", header: "Make", priority: 3, cell: ({ it }) => it.make ?? "-" },
    { key: "uom", header: "UOM", priority: 3, cell: ({ it }) => it.uom },
    ...(seeCost ? [
      { key: "cost", header: "Latest cost", align: "right" as const, nowrap: true, cell: ({ it }: Row) => money(latestCostOf(it).rate) },
      { key: "source", header: "Source", priority: 3 as const, className: "text-caption",
        cell: ({ it, vendorName }: Row) => {
          const c = latestCostOf(it);
          return c.source === "purchase"
            ? <span title={vendorName ?? undefined}>{fmtDate(c.date)}<div className="max-w-40 truncate text-ink-faint">{vendorName ?? "-"}</div></span>
            : c.source === "list" ? <StatusPill semantic="neutral" label="List price" noDot /> : <StatusPill semantic="danger" label="No price" noDot />;
        } },
      { key: "age", header: "Age", align: "right" as const, card: "badge" as const, nowrap: true,
        cell: ({ it }: Row) => {
          const age = priceAgeDays(it.lastPurchaseDate, today);
          if (age == null) return <span className="text-ink-faint">-</span>;
          const stale = isPriceStale(it, today);
          return <StatusPill semantic={stale ? (it.volatilePrice ? "danger" : "warning") : "success"} label={`${age}d${stale ? " · stale" : ""}`} />;
        } },
    ] : []),
    { key: "lastSale", header: "Last sale", align: "right", nowrap: true, priority: 3,
      cell: ({ it }) => it.lastSaleRate != null ? <span title={fmtDate(it.lastSaleDate)}>{money(it.lastSaleRate)}</span> : "-" },
    ...(seeCost ? [{ key: "markup", header: "Markup", align: "right" as const, priority: 3 as const, cell: ({ it }: Row) => pct(it.markupPct, 0) }] : []),
    { key: "sell", header: "Suggested sell", align: "right", card: "amount", nowrap: true, className: "font-medium",
      cell: ({ it }) => money0(suggestedSupplyRate(latestCostOf(it).rate, it.markupPct)) },
  ];

  return (
    <ListPage
      {...header}
      isEmpty={rows.length === 0}
      empty={
        <ListEmpty filtered={activeFilters > 0 || sp.stale === "1"} noun="items" clearHref="/items"
          action={write && <LinkButton href="/items/new"><Plus className="icon-sm" aria-hidden /> Add the first item</LinkButton>}>
          Add items to the master so quotations and purchase invoices can pick them up.
        </ListEmpty>
      }
      resultSummary={
        <>
          {total} item{total === 1 ? "" : "s"}
          {seeCost && <> · prices are buying cost. Stale means volatile items over {STALE_DAYS_VOLATILE} days, others over {STALE_DAYS_DEFAULT} days since the last purchase.</>}
        </>
      }
      pagination={<Pagination page={page} pages={pages} total={total} noun="items" href={(p) => itemsHref({ ...base, page: p })} />}
    >
      <ResponsiveTable tall rows={rows} columns={columns} rowKey={(r) => r.it.id} caption="Items" />
    </ListPage>
  );
}

type Header = {
  title: string; subtitle: string; secondaryActions: ReactNode; primaryAction: ReactNode; tabs: ReactNode; notices: ReactNode; filters: ReactNode;
};

async function PriceMatrix({ header, where, seeCost, basis, base }: {
  header: Header; where: SQL | undefined; seeCost: boolean; basis: "cost" | "sell"; base: Record<string, string | undefined>;
}) {
  const db = await getDb();
  const rows = await db
    .select({
      id: items.id, code: items.code, name: items.name, groupName: items.groupName, make: items.make, size: items.size, markupPct: items.markupPct,
      lastPurchaseRate: items.lastPurchaseRate, lastPurchaseDate: items.lastPurchaseDate, lastPurchaseVendorId: items.lastPurchaseVendorId, listPrice: items.listPrice,
    })
    .from(items).where(where).orderBy(asc(items.system), asc(items.groupName), asc(items.make));
  type Cell = { id: number; rate: number | null; source: string; code: string };
  const matrix = new Map<string, { group: string; make: string | null; cells: Map<string, Cell> }>();
  const used = new Set<string>();
  const others: typeof rows = [];
  for (const it of rows) {
    const nb = normaliseNB(it.size);
    if (!nb) { others.push(it); continue; }
    const key = `${it.groupName}||${it.make ?? ""}`;
    if (!matrix.has(key)) matrix.set(key, { group: it.groupName, make: it.make, cells: new Map() });
    const c = latestCostOf(it);
    const rate = basis === "cost" ? c.rate : suggestedSupplyRate(c.rate, it.markupPct);
    matrix.get(key)!.cells.set(nb, { id: it.id, rate, source: c.source, code: it.code });
    used.add(nb);
  }
  const sizes = NB_SIZES.filter((s) => used.has(s));
  type MatrixRow = { group: string; make: string | null; cells: Map<string, Cell> };
  const matrixRows: MatrixRow[] = [...matrix.values()];
  const othersShown = others.slice(0, OTHERS_LIMIT);
  const filtered = !!(base.q || base.system || base.group || base.make);

  return (
    <ListPage
      {...header}
      filters={
        <>
          {header.filters}
          {seeCost && (
            <FilterPills label="Price basis" items={[
              { label: "Buying cost", href: itemsHref({ ...base, view: "matrix" }), active: basis === "cost" },
              { label: "Selling rate", href: itemsHref({ ...base, view: "matrix", basis: "sell" }), active: basis === "sell" },
            ]} />
          )}
        </>
      }
      isEmpty={rows.length === 0}
      empty={<ListEmpty filtered={filtered} noun="items" clearHref="/items?view=matrix">Add items to the master to build the price matrix.</ListEmpty>}
      resultSummary={
        <>
          Rows are item groups, columns are pipe sizes from 300 NB down to 25 NB, like the client price list. Showing{" "}
          <strong className="text-ink">{basis === "cost" ? "latest buying cost" : "suggested selling rate"}</strong>. <span className="italic">Italic</span> means list price (not yet purchased).
        </>
      }
    >
      <div className="space-y-4">
        {matrix.size === 0 ? (
          <EmptyState title="No NB sized items for these filters">The size matrix covers pipes, fittings and valves sized in NB. Other items are listed below and in the item list.</EmptyState>
        ) : (
          <ResponsiveTable cards={false} stickyFirst tall rows={matrixRows} rowKey={(r) => r.group + (r.make ?? "")} caption="Price matrix by group and size"
            rowClassName={() => "hover:bg-muted/50"}
            columns={[
              { key: "group", header: "Group / make", className: "font-medium",
                cell: (r) => <>{r.group}{r.make && <div className="text-caption font-normal text-ink-faint">{r.make}</div>}</> },
              ...sizes.map((s): Column<MatrixRow> => ({
                key: s, header: s.replace("NB", " NB"), align: "right",
                cell: (r) => {
                  const c = r.cells.get(s);
                  return c
                    ? <Link href={`/items/${c.id}`} title={c.code} className={cx("hover:underline", c.source === "list" && "italic text-ink-soft")}>{c.rate == null ? "-" : money0(c.rate)}</Link>
                    : <span className="text-ink-faint" aria-label="Not stocked">·</span>;
                },
              })),
            ]} />
        )}
        {others.length > 0 && (
          <SectionCard title="Other items not sized in NB" count={others.length} flush>
            <Table className="rounded-none border-0 shadow-none">
              <caption className="sr-only">Other items</caption>
              <thead><tr><Th>Group</Th><Th>Item</Th><Th>Size</Th><Th>Make</Th><Th className="text-right">{basis === "cost" ? "Latest cost" : "Suggested sell"}</Th></tr></thead>
              <tbody>
                {othersShown.map((it) => {
                  const c = latestCostOf(it);
                  const rate = basis === "cost" ? c.rate : suggestedSupplyRate(c.rate, it.markupPct);
                  return (
                    <tr key={it.id}>
                      <Td>{it.groupName}</Td>
                      <Td className="max-w-72 whitespace-normal"><Link href={`/items/${it.id}`} className="hover:underline">{it.name}</Link></Td>
                      <Td>{it.size ?? "-"}</Td><Td>{it.make ?? "-"}</Td>
                      <Td className={cx("text-right tabular-nums", c.source === "list" && "italic text-ink-soft")}>{money0(rate)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {others.length > othersShown.length && (
              <p className="border-t border-line px-4 py-3 text-sm text-ink-soft">
                Showing the first {othersShown.length} of {others.length}.{" "}
                <Link href={itemsHref({ ...base })} className={cx("font-medium", linkCls)}>See every item in the item list</Link>
              </p>
            )}
          </SectionCard>
        )}
      </div>
    </ListPage>
  );
}
