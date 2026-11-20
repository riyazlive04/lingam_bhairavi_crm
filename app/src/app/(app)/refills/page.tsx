import Link from "next/link";
import { and, asc, eq, gt, gte, ilike, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, extinguisherAssets } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { addDays, daysBetween, fmtDate, todayIST } from "@/lib/format";
import { BUCKET_LABELS, refillBucket, type RefillBucket } from "@/lib/refills";
import { Button, Card, EmptyState, Flash, Input, LinkButton, PageHeader, Select, Table, Td, Th, cx } from "@/components/ui";
import { AssetTable, type AssetRow } from "./_components/asset-table";
import { recordRefill } from "./actions";

type SP = { bucket?: string; customerId?: string; customer?: string; type?: string; make?: string; q?: string; status?: string; ok?: string; err?: string };
const BUCKETS: RefillBucket[] = ["overdue", "due10", "due30", "later"];
const BUCKET_STYLE: Record<RefillBucket, string> = {
  overdue: "border-red-300 dark:border-red-900",
  due10: "border-amber-300 dark:border-amber-900",
  due30: "border-blue-300 dark:border-blue-900",
  later: "border-line",
};
const BUCKET_TEXT: Record<RefillBucket, string> = {
  overdue: "text-red-600", due10: "text-amber-600", due30: "text-blue-600", later: "text-ink",
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

  return (
    <div>
      <PageHeader
        title="Extinguisher Refill Tracker"
        subtitle="Internal reminders only; customers are not notified automatically. Refills due within 10 days also appear on the dashboard."
        actions={writable && <LinkButton href="/refills/new"><Plus className="h-4 w-4" aria-hidden /> Add assets</LinkButton>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <nav aria-label="Due buckets" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BUCKETS.map((b) => (
          <Link
            key={b}
            href={keep({ bucket: bucket === b ? undefined : b })}
            aria-current={bucket === b ? "page" : undefined}
            className={cx("rounded-xl border-2 bg-surface p-4 shadow-sm transition hover:shadow", BUCKET_STYLE[b], bucket === b && "ring-2 ring-brand-500")}
          >
            <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">{BUCKET_LABELS[b]}</div>
            <div className={cx("mt-1 text-2xl font-semibold tabular-nums", c[b] ? BUCKET_TEXT[b] : "text-ink")}>{c[b]}</div>
            <div className="text-xs text-ink-soft">units{bucket === b ? " · showing" : ""}</div>
          </Link>
        ))}
      </nav>

      <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {bucket && <input type="hidden" name="bucket" value={bucket} />}
        <Input name="q" defaultValue={sp.q} placeholder="Customer, location, serial…" className="col-span-2 sm:w-56" aria-label="Search" />
        <Select name="customerId" defaultValue={sp.customerId ?? ""} aria-label="Customer" className="col-span-2 sm:w-56">
          <option value="">All customers</option>
          {customerList.map((cu) => <option key={cu.id} value={cu.id}>{cu.name}</option>)}
        </Select>
        <Select name="type" defaultValue={sp.type ?? ""} aria-label="Type" className="sm:w-40">
          <option value="">All types</option>
          {typeList.map((t) => <option key={t.v} value={t.v}>{t.v}</option>)}
        </Select>
        <Select name="make" defaultValue={sp.make ?? ""} aria-label="Make" className="sm:w-36">
          <option value="">All makes</option>
          {makeList.filter((m) => m.v).map((m) => <option key={m.v!} value={m.v!}>{m.v}</option>)}
        </Select>
        <Select name="status" defaultValue={status} aria-label="Status" className="sm:w-32">
          <option value="active">Active</option>
          <option value="retired">Retired</option>
        </Select>
        <Button type="submit" variant="secondary">Filter</Button>
        {filtered && <Link href="/refills" className="self-center text-sm text-ink-soft hover:text-brand-700">Clear</Link>}
      </form>

      {assetRows.length === 0 ? (
        <EmptyState
          title={filtered ? "No assets match" : "No extinguishers tracked yet"}
          action={writable && !filtered ? <LinkButton href="/refills/new">Add customer extinguishers</LinkButton> : undefined}
        >
          {filtered ? "Try another bucket or clear the filters." : "Add each customer's extinguishers with their last refill date; the next due date is calculated automatically."}
        </EmptyState>
      ) : (
        <AssetTable rows={assetRows} canWrite={writable} today={today} recordAction={recordRefill} back={keep({})} />
      )}
      {rows.length >= 1000 && <p className="mt-2 text-xs text-ink-soft">Showing the first 1,000 assets. Use the filters to narrow things down.</p>}

      {summary.length > 0 && (
        <Card title="Customer-wise summary" className="mt-6" bodyClassName="p-0">
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>Customer</Th><Th>Phone</Th><Th className="text-right">Units</Th><Th className="text-right">Overdue</Th><Th className="text-right">Due ≤ 30 d</Th><Th>Next due</Th></tr></thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.customerId}>
                  <Td><Link href={keep({ customerId: String(s.customerId), bucket: undefined })} className="text-brand-700 hover:underline dark:text-brand-300">{s.name}</Link></Td>
                  <Td>{s.phone ? <a href={`tel:${s.phone}`} className="hover:text-brand-700">{s.phone}</a> : "-"}</Td>
                  <Td className="text-right tabular-nums">{s.units}</Td>
                  <Td className={cx("text-right tabular-nums", s.overdue ? "font-semibold text-red-600" : "text-ink-faint")}>{s.overdue}</Td>
                  <Td className={cx("text-right tabular-nums", s.due30 ? "text-amber-700 dark:text-amber-400" : "text-ink-faint")}>{s.due30}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(s.nextDue)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
