import Link from "next/link";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { FileSpreadsheet, Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, quotations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { QUOTE_STATUSES, SYSTEMS, type SystemKey } from "@/lib/constants";
import { daysBetween, fmtDate, money, moneyShort, pct, todayIST } from "@/lib/format";
import { EDITABLE_QUOTE_STATUSES, istDate } from "@/lib/quotations";
import { Badge, Button, EmptyState, Flash, Input, LinkButton, PageHeader, Select, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";

export const metadata = { title: "Quotations" };

type SP = {
  q?: string; status?: string; system?: string; customer?: string; sp?: string; from?: string; to?: string; page?: string; ok?: string; err?: string;
  /** "pending" = only quotations awaiting an admin's approval (rule 11) */
  approval?: string;
};
const PAGE = 50;
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const posInt = (s?: string) => (s && /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null);

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("quotations");
  const db = await getDb();
  const sp = await searchParams;
  const writable = canWrite(user.role, "quotations");
  const today = todayIST();

  // filters (all except status → used for pipeline stats too)
  const base: SQL[] = [];
  if (sp.system && sp.system in SYSTEMS) base.push(eq(quotations.system, sp.system));
  const custId = posInt(sp.customer);
  if (custId) base.push(eq(quotations.customerId, custId));
  const spId = posInt(sp.sp);
  if (spId) base.push(eq(quotations.preparedBy, spId));
  if (isDate(sp.from)) base.push(gte(quotations.quoteDate, sp.from!));
  if (isDate(sp.to)) base.push(lte(quotations.quoteDate, sp.to!));
  if (sp.q?.trim()) {
    const like = `%${sp.q.trim()}%`;
    const c = or(ilike(quotations.number, like), ilike(quotations.projectName, like), ilike(customers.name, like), ilike(quotations.siteLocation, like));
    if (c) base.push(c);
  }
  const status = sp.status && (QUOTE_STATUSES as readonly string[]).includes(sp.status) ? sp.status : null;
  const awaiting = sp.approval === "pending";
  const pendingCond = and(eq(quotations.approvalStatus, "pending"), inArray(quotations.status, [...EDITABLE_QUOTE_STATUSES]));
  const where = and(...base, ...(status ? [eq(quotations.status, status)] : []), ...(awaiting ? [pendingCond] : []));
  const page = Math.max(1, posInt(sp.page) ?? 1);

  const [rows, [{ total }], byStatus, closedWon, custs, salespeople, [{ awaitingN }]] = await Promise.all([
    db.select({
      id: quotations.id, number: quotations.number, revision: quotations.revision, status: quotations.status, quoteDate: quotations.quoteDate,
      validUntil: quotations.validUntil, projectName: quotations.projectName, system: quotations.system, grandTotal: quotations.grandTotal,
      nextFollowUpDate: quotations.nextFollowUpDate, customerName: customers.name, preparedBy: users.name, approvalStatus: quotations.approvalStatus,
    })
      .from(quotations)
      .leftJoin(customers, eq(customers.id, quotations.customerId))
      .leftJoin(users, eq(users.id, quotations.preparedBy))
      .where(where)
      .orderBy(desc(quotations.quoteDate), desc(quotations.id))
      .limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: count() }).from(quotations).leftJoin(customers, eq(customers.id, quotations.customerId)).where(where),
    db.select({
      status: quotations.status, n: count(),
      value: sql<number>`coalesce(sum(${quotations.grandTotal}),0)`.mapWith(Number),
    }).from(quotations).leftJoin(customers, eq(customers.id, quotations.customerId)).where(and(...base)).groupBy(quotations.status),
    db.select({ quoteDate: quotations.quoteDate, closedAt: quotations.closedAt }).from(quotations)
      .leftJoin(customers, eq(customers.id, quotations.customerId)).where(and(...base, eq(quotations.status, "won"))),
    db.select({ id: customers.id, name: customers.name }).from(customers).orderBy(asc(customers.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(or(eq(users.role, "sales"), eq(users.role, "admin"))).orderBy(asc(users.name)),
    db.select({ awaitingN: count() }).from(quotations).leftJoin(customers, eq(customers.id, quotations.customerId)).where(and(...base, pendingCond)),
  ]);

  const stat = (s: string) => byStatus.find((b) => b.status === s) ?? { n: 0, value: 0 };
  const won = Number(stat("won").n), lost = Number(stat("lost").n);
  const conversion = won + lost > 0 ? (won / (won + lost)) * 100 : null;
  const closeDays = closedWon.filter((c) => c.closedAt).map((c) => daysBetween(c.quoteDate, istDate(c.closedAt!)));
  const avgClose = closeDays.length ? closeDays.reduce((a, b) => a + b, 0) / closeDays.length : null;
  const openN = Number(stat("sent").n) + Number(stat("negotiation").n);
  const openV = stat("sent").value + stat("negotiation").value;
  const totalN = Number(total);
  const pages = Math.max(1, Math.ceil(totalN / PAGE));
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ok: undefined, err: undefined, ...patch })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/quotations?${s}` : "/quotations";
  };

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Standard BOQ-based quotations, priced from the latest purchase cost."
        actions={writable && <>
          <LinkButton href="/boq-import" variant="secondary"><FileSpreadsheet className="h-4 w-4" aria-hidden /> Import consultant BOQ</LinkButton>
          <LinkButton href="/quotations/new"><Plus className="h-4 w-4" aria-hidden /> New quotation</LinkButton>
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open pipeline" value={moneyShort(openV)} hint={`${openN} sent / in negotiation`} href={qs({ status: "sent", page: undefined })} />
        <Stat label="Won" value={moneyShort(stat("won").value)} hint={`${won} quotation${won === 1 ? "" : "s"}`} tone="good" href={qs({ status: "won", page: undefined })} />
        <Stat label="Conversion" value={conversion == null ? "-" : pct(conversion, 0)} hint={`won ÷ (won + lost) · ${lost} lost`} tone={conversion != null && conversion < 25 ? "warn" : "default"} />
        <Stat label="Avg. days to close" value={avgClose == null ? "-" : Math.round(avgClose)} hint="quote date → won" />
      </div>

      <nav aria-label="Filter by status" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <StatusPill href={qs({ status: undefined, approval: undefined, page: undefined })} active={!status && !awaiting} label="All" n={byStatus.reduce((s, b) => s + Number(b.n), 0)} />
        <Link
          href={qs({ status: undefined, approval: awaiting ? undefined : "pending", page: undefined })}
          aria-current={awaiting ? "page" : undefined}
          className={cx(
            "shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-colors",
            awaiting ? "border-amber-500 bg-amber-50 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
              : Number(awaitingN) > 0 ? "border-amber-300 bg-surface text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40" : "border-line bg-surface text-ink-soft hover:bg-muted",
          )}
        >
          Awaiting approval <span className="tabular-nums">({Number(awaitingN)})</span>
        </Link>
        {QUOTE_STATUSES.map((s) => (
          <StatusPill key={s} href={qs({ status: s, approval: undefined, page: undefined })} active={status === s && !awaiting} label={s} n={Number(stat(s).n)} value={stat(s).value} />
        ))}
      </nav>

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {status && <input type="hidden" name="status" value={status} />}
        {awaiting && <input type="hidden" name="approval" value="pending" />}
        <Input name="q" defaultValue={sp.q} placeholder="Search no., customer, project…" aria-label="Search" className="lg:col-span-2" />
        <Select name="system" defaultValue={sp.system ?? ""} aria-label="System">
          <option value="">All systems</option>
          {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="customer" defaultValue={sp.customer ?? ""} aria-label="Customer">
          <option value="">All customers</option>
          {custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="sp" defaultValue={sp.sp ?? ""} aria-label="Salesperson">
          <option value="">All salespeople</option>
          {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <div className="flex gap-2">
          <Input type="date" name="from" defaultValue={sp.from} aria-label="From date" />
          <Input type="date" name="to" defaultValue={sp.to} aria-label="To date" />
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6 lg:justify-end">
          <Button type="submit" variant="secondary">Apply filters</Button>
          <LinkButton href="/quotations" variant="ghost">Reset</LinkButton>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={awaiting ? "Nothing is waiting for approval" : base.length || status ? "No quotations match these filters" : "No quotations yet"}
          action={writable && <LinkButton href="/quotations/new">Create the first quotation</LinkButton>}
        >
          Pick a standard BOQ, enter quantities and the latest prices are filled in automatically.
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Quotation</Th><Th>Customer / project</Th><Th>Date</Th><Th>Status</Th><Th className="text-right">Value (incl. GST)</Th>
                <Th>Next follow-up</Th><Th>Prepared by</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = r.status === "sent" || r.status === "negotiation";
                const overdue = open && r.nextFollowUpDate && r.nextFollowUpDate < today;
                return (
                  <tr key={r.id} className="hover:bg-muted/50">
                    <Td className="whitespace-nowrap">
                      <Link href={`/quotations/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.number}</Link>
                      {r.system && <div className="text-xs text-ink-soft">{SYSTEMS[r.system as SystemKey] ?? r.system}</div>}
                    </Td>
                    <Td className="max-w-xs whitespace-normal">
                      <div className="font-medium">{r.customerName ?? "-"}</div>
                      {r.projectName && <div className="truncate text-xs text-ink-soft">{r.projectName}</div>}
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.quoteDate)}</Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={r.status} />
                        {r.approvalStatus === "pending" && (EDITABLE_QUOTE_STATUSES as readonly string[]).includes(r.status) && <Badge tone="amber">Awaiting approval</Badge>}
                        {r.approvalStatus === "rejected" && (EDITABLE_QUOTE_STATUSES as readonly string[]).includes(r.status) && <Badge tone="red">Not approved</Badge>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{money(r.grandTotal)}</Td>
                    <Td className={cx("whitespace-nowrap", overdue && "font-medium text-red-600")}>
                      {open ? (r.nextFollowUpDate ? `${fmtDate(r.nextFollowUpDate)}${overdue ? " ⚠" : ""}` : <span className="text-amber-700 dark:text-amber-400">Not set</span>) : "-"}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-soft">{r.preparedBy ?? "-"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              <span className="text-ink-soft">Page {page} of {pages} · {totalN} quotations</span>
              <div className="flex gap-2">
                {page > 1 && <LinkButton variant="secondary" size="sm" href={qs({ page: String(page - 1) })}>Previous</LinkButton>}
                {page < pages && <LinkButton variant="secondary" size="sm" href={qs({ page: String(page + 1) })}>Next</LinkButton>}
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function StatusPill({ href, active, label, n, value }: { href: string; active: boolean; label: string; n: number; value?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "shrink-0 rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors",
        active ? "border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-brand-800/30 dark:text-brand-200" : "border-line bg-surface text-ink-soft hover:bg-muted",
      )}
    >
      {label} <span className="tabular-nums">({n})</span>
      {value != null && value > 0 && <span className="ml-1 hidden text-xs sm:inline">· {moneyShort(value)}</span>}
    </Link>
  );
}
