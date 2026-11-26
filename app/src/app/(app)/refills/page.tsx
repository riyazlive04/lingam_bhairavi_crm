import Link from "next/link";
import { and, asc, eq, gt, gte, ilike, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { AlarmClock, CalendarCheck, CalendarClock, CalendarRange, Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, extinguisherAssets } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { addDays, daysBetween, fmtDate, todayIST } from "@/lib/format";
import { BUCKET_LABELS, refillBucket, type RefillBucket } from "@/lib/refills";
import { Flash, LinkButton, Select, cx } from "@/components/ui";
import {
  FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, ResponsiveTable, SectionCard, type Column,
} from "@/components/patterns";
import { AssetTable, type AssetRow } from "./_components/asset-table";
import { recordRefill } from "./actions";

export const metadata = { title: "Refill tracker" };

type SP = { bucket?: string; customerId?: string; customer?: string; type?: string; make?: string; q?: string; status?: string; ok?: string; err?: string };
const BUCKETS: RefillBucket[] = ["overdue", "due10", "due30", "later"];
/** Tile tone and icon per due bucket. Tones only light up when the bucket has units in it. */
const BUCKET_TILE: Record<RefillBucket, { tone: "bad" | "warn" | "default"; icon: typeof AlarmClock }> = {
  overdue: { tone: "bad", icon: AlarmClock },
  due10: { tone: "warn", icon: CalendarClock },
  due30: { tone: "default", icon: CalendarRange },
  later: { tone: "default", icon: CalendarCheck },
};

export default async function RefillsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("refills");
  const raw = await searchParams;
  // `?customer=` is an alias used by dashboard / agent alert / startup-digest links
  const sp: SP = { ...raw, customerId: raw.customerId ?? raw.customer };
  const db = await getDb();
  const today = todayIST();
  const d10 = addDays(today, 10);
  const d30 = addDays(today, 30);
  const status = sp.status === "retired" ? "retired" : "active";
  const bucket = BUCKETS.includes(sp.bucket as RefillBucket) ? (sp.bucket as RefillBucket) : undefined;

  // filters shared by bucket counts and the list
  const base: SQL[] = [eq(extinguisherAssets.status, status)];
  const customerId = Number(sp.customerId) || 0;
  if (customerId) base.push(eq(extinguisherAssets.customerId, customerId));
  if (sp.type) base.push(eq(extinguisherAssets.extType, sp.type));
  if (sp.make) base.push(eq(extinguisherAssets.make, sp.make));
  const q = sp.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const c = or(ilike(customers.name, like), ilike(extinguisherAssets.location, like), ilike(extinguisherAssets.serialNo, like));
    if (c) base.push(c);
  }
  const bucketCond: Record<RefillBucket, SQL> = {
    overdue: lt(extinguisherAssets.nextDueDate, today),
    due10: and(gte(extinguisherAssets.nextDueDate, today), lte(extinguisherAssets.nextDueDate, d10))!,
    due30: and(gt(extinguisherAssets.nextDueDate, d10), lte(extinguisherAssets.nextDueDate, d30))!,
    later: gt(extinguisherAssets.nextDueDate, d30),
  };
  const listConds = bucket ? [...base, bucketCond[bucket]] : base;

  const unitsSql = sql<number>`coalesce(sum(${extinguisherAssets.qty}),0)`.mapWith(Number);
  const [counts, rows, customerList, typeList, makeList, summary] = await Promise.all([
    db
      .select({
        overdue: sql<number>`coalesce(sum(case when ${extinguisherAssets.nextDueDate} < ${today} then ${extinguisherAssets.qty} else 0 end),0)`.mapWith(Number),
        due10: sql<number>`coalesce(sum(case when ${extinguisherAssets.nextDueDate} >= ${today} and ${extinguisherAssets.nextDueDate} <= ${d10} then ${extinguisherAssets.qty} else 0 end),0)`.mapWith(Number),
        due30: sql<number>`coalesce(sum(case when ${extinguisherAssets.nextDueDate} > ${d10} and ${extinguisherAssets.nextDueDate} <= ${d30} then ${extinguisherAssets.qty} else 0 end),0)`.mapWith(Number),
        later: sql<number>`coalesce(sum(case when ${extinguisherAssets.nextDueDate} > ${d30} then ${extinguisherAssets.qty} else 0 end),0)`.mapWith(Number),
      })
      .from(extinguisherAssets)
      .innerJoin(customers, eq(customers.id, extinguisherAssets.customerId))
      .where(and(...base)),
    db
      .select({
        id: extinguisherAssets.id, customerId: extinguisherAssets.customerId, customerName: customers.name, location: extinguisherAssets.location,
        extType: extinguisherAssets.extType, make: extinguisherAssets.make, serialNo: extinguisherAssets.serialNo, qty: extinguisherAssets.qty,
        lastRefillDate: extinguisherAssets.lastRefillDate, refillIntervalMonths: extinguisherAssets.refillIntervalMonths,
        nextDueDate: extinguisherAssets.nextDueDate, hptDueDate: extinguisherAssets.hptDueDate, status: extinguisherAssets.status,
      })
      .from(extinguisherAssets)
      .innerJoin(customers, eq(customers.id, extinguisherAssets.customerId))
      .where(and(...listConds))
      .orderBy(asc(extinguisherAssets.nextDueDate), asc(customers.name), asc(extinguisherAssets.location))
      .limit(1000),
    db.selectDistinct({ id: customers.id, name: customers.name }).from(customers)
      .innerJoin(extinguisherAssets, eq(extinguisherAssets.customerId, customers.id)).orderBy(asc(customers.name)),
    db.selectDistinct({ v: extinguisherAssets.extType }).from(extinguisherAssets).orderBy(asc(extinguisherAssets.extType)),
    db.selectDistinct({ v: extinguisherAssets.make }).from(extinguisherAssets).orderBy(asc(extinguisherAssets.make)),
    db
      .select({
        customerId: customers.id, name: customers.name, phone: customers.phone,
        units: unitsSql,
        overdue: sql<number>`coalesce(sum(case when ${extinguisherAssets.nextDueDate} < ${today} then ${extinguisherAssets.qty} else 0 end),0)`.mapWith(Number),
        due30: sql<number>`coalesce(sum(case when ${extinguisherAssets.nextDueDate} >= ${today} and ${extinguisherAssets.nextDueDate} <= ${d30} then ${extinguisherAssets.qty} else 0 end),0)`.mapWith(Number),
        nextDue: sql<string>`min(${extinguisherAssets.nextDueDate})::text`,
      })
      .from(extinguisherAssets)
      .innerJoin(customers, eq(customers.id, extinguisherAssets.customerId))
      .where(and(...base))
      .groupBy(customers.id, customers.name, customers.phone)
      .orderBy(sql`min(${extinguisherAssets.nextDueDate})`),
  ]);
  const c = counts[0] ?? { overdue: 0, due10: 0, due30: 0, later: 0 };

  const assetRows: AssetRow[] = rows.map((r) => ({
    ...r,
    qty: Number(r.qty),
    daysLeft: daysBetween(today, r.nextDueDate),
    bucket: refillBucket(r.nextDueDate, today),
    hptDue: !!r.hptDueDate && r.hptDueDate <= d30,
  }));
  const writable = canWrite(user.role, "refills");
  const keep = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { customerId: sp.customerId, type: sp.type, make: sp.make, q: sp.q, status: sp.status, bucket: sp.bucket, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/refills${s ? `?${s}` : ""}`;
  };
  const filtered = !!(customerId || sp.type || sp.make || q || bucket || status === "retired");
  const activeFilters = [customerId || undefined, sp.type, sp.make, q].filter(Boolean).length;

  type Sum = (typeof summary)[number];
  const summaryCols: Column<Sum>[] = [
    { key: "name", header: "Customer", card: "title",
      cell: (s) => <Link href={keep({ customerId: String(s.customerId), bucket: undefined })} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{s.name}</Link> },
    { key: "next", header: "Next due", card: "subtitle", nowrap: true, cell: (s) => fmtDate(s.nextDue) },
    { key: "phone", header: "Phone", cell: (s) => (s.phone ? <a href={`tel:${s.phone}`} className="relative z-[1] hover:text-brand-700 dark:hover:text-brand-300">{s.phone}</a> : "-") },
    { key: "units", header: "Units", align: "right", card: "amount", cell: (s) => s.units },
    { key: "overdue", header: "Overdue", align: "right",
      cell: (s) => <span className={cx(s.overdue ? "font-semibold text-danger" : "text-ink-faint")}>{s.overdue}</span> },
    { key: "due30", header: "Due in 30 days", align: "right",
      cell: (s) => <span className={cx(s.due30 ? "font-medium text-warning" : "text-ink-faint")}>{s.due30}</span> },
  ];

  return (
    <ListPage
      title="Extinguisher refill tracker"
      subtitle="Internal reminders only. Customers are not notified automatically. Refills due within 10 days also appear on the dashboard."
      primaryAction={writable && <LinkButton href="/refills/new"><Plus className="icon-sm" aria-hidden /> Add assets</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={
        <MetricStrip>
          {BUCKETS.map((b) => (
            <Metric key={b} label={BUCKET_LABELS[b]} value={c[b]} icon={BUCKET_TILE[b].icon} tone={c[b] ? BUCKET_TILE[b].tone : "default"}
              hint={bucket === b ? "Units, showing only these" : "Units"} href={keep({ bucket: bucket === b ? undefined : b })} />
          ))}
        </MetricStrip>
      }
      filters={
        <>
          <FilterPills label="Filter by due date" items={[
            { label: "All due dates", href: keep({ bucket: undefined }), active: !bucket },
            ...BUCKETS.map((b) => ({ label: BUCKET_LABELS[b], href: keep({ bucket: b }), active: bucket === b, count: c[b], attention: b === "overdue" && c[b] > 0 })),
          ]} />
          <ListFilters q={sp.q} placeholder="Customer, location, serial" activeCount={activeFilters}
            clearHref={keep({ customerId: undefined, type: undefined, make: undefined, q: undefined })} hidden={{ bucket }}>
            <Select name="customerId" defaultValue={sp.customerId ?? ""} aria-label="Customer">
              <option value="">All customers</option>
              {customerList.map((cu) => <option key={cu.id} value={cu.id}>{cu.name}</option>)}
            </Select>
            <Select name="type" defaultValue={sp.type ?? ""} aria-label="Type">
              <option value="">All types</option>
              {typeList.map((t) => <option key={t.v} value={t.v}>{t.v}</option>)}
            </Select>
            <Select name="make" defaultValue={sp.make ?? ""} aria-label="Make">
              <option value="">All makes</option>
              {makeList.filter((m) => m.v).map((m) => <option key={m.v!} value={m.v!}>{m.v}</option>)}
            </Select>
            <Select name="status" defaultValue={status} aria-label="Status">
              <option value="active">Active</option>
              <option value="retired">Retired</option>
            </Select>
          </ListFilters>
        </>
      }
      density={false}
      isEmpty={assetRows.length === 0}
      empty={
        <ListEmpty filtered={filtered} noun="assets" clearHref="/refills" title={filtered ? undefined : "No extinguishers tracked yet"}
          action={writable && <LinkButton href="/refills/new"><Plus className="icon-sm" aria-hidden /> Add customer extinguishers</LinkButton>}>
          Add each customer&apos;s extinguishers with their last refill date. The next due date is calculated for you.
        </ListEmpty>
      }
    >
      <div className="space-y-4">
        <AssetTable rows={assetRows} canWrite={writable} today={today} recordAction={recordRefill} back={keep({})} />
        {rows.length >= 1000 && <p className="text-caption text-ink-soft">Showing the first 1,000 assets. Use the filters to narrow things down.</p>}

        {summary.length > 0 && (
          <SectionCard title="By customer" count={summary.length} flush description="Tap a customer to see only their extinguishers.">
            <ResponsiveTable flush rows={summary} columns={summaryCols} rowKey={(s) => s.customerId} caption="Refills by customer" />
          </SectionCard>
        )}
      </div>
    </ListPage>
  );
}
