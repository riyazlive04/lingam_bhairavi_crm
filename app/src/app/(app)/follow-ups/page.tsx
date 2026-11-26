import Link from "next/link";
import { and, asc, count, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import { CalendarClock, CheckCircle2, MessageCircle, Phone, XCircle } from "lucide-react";
import { getDb } from "@/db";
import { customers, followUps, quotations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { addDays, daysBetween, fmtDate, money, moneyShort, pct, todayIST } from "@/lib/format";
import { FOLLOWUP_MODE_LABEL, FOLLOWUP_OUTCOME_LABEL, istDate, telLink, whatsappLink } from "@/lib/quotations";
import { Flash, LinkButton, Select, buttonClass } from "@/components/ui";
import { FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, SectionCard, StatusPill, type FilterPillItem } from "@/components/patterns";
import { FollowUpForm, LostForm } from "../quotations/_components/forms";

export const metadata = { title: "Follow-ups" };

type Row = {
  id: number; number: string; status: string; projectName: string | null; grandTotal: number; quoteDate: string; sentAt: Date | null;
  nextFollowUpDate: string | null; customerName: string | null; contactPerson: string | null; phone: string | null; preparedBy: string | null;
};
const BUCKETS = ["overdue", "today", "upcoming", "none", "later"] as const;
type Bucket = (typeof BUCKETS)[number];
type LastFu = { date: string; mode: string; outcome: string | null; notes: string | null };


export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ sp?: string; bucket?: string; ok?: string; err?: string }> }) {
  const user = await requireUser("followups");
  const db = await getDb();
  const sp = await searchParams;
  const today = todayIST();
  const in7 = addDays(today, 7);
  const monthStart = today.slice(0, 8) + "01";
  const monthStartTs = new Date(`${monthStart}T00:00:00+05:30`);
  const writable = canWrite(user.role, "followups");
  const quoteWritable = canWrite(user.role, "quotations");
  const spId = sp.sp === "me" ? user.id : sp.sp && /^\d+$/.test(sp.sp) ? Number(sp.sp) : null;

  const conds: SQL[] = [inArray(quotations.status, ["sent", "negotiation"])];
  if (spId) conds.push(eq(quotations.preparedBy, spId));

  const monthConds: SQL[] = spId ? [eq(quotations.preparedBy, spId)] : [];
  const [rows, salespeople, closedMonth, [{ sentMonth }], [{ fuMonth }]] = await Promise.all([
    db.select({
      id: quotations.id, number: quotations.number, status: quotations.status, projectName: quotations.projectName, grandTotal: quotations.grandTotal,
      quoteDate: quotations.quoteDate, sentAt: quotations.sentAt, nextFollowUpDate: quotations.nextFollowUpDate,
      customerName: customers.name, contactPerson: customers.contactPerson, phone: customers.phone, preparedBy: users.name,
    })
      .from(quotations)
      .leftJoin(customers, eq(customers.id, quotations.customerId))
      .leftJoin(users, eq(users.id, quotations.preparedBy))
      .where(and(...conds))
      .orderBy(asc(quotations.nextFollowUpDate), desc(quotations.grandTotal)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.active, true), or(eq(users.role, "sales"), eq(users.role, "admin")))).orderBy(asc(users.name)),
    db.select({ status: quotations.status, n: count(), value: sql<number>`coalesce(sum(${quotations.grandTotal}),0)`.mapWith(Number) })
      .from(quotations).where(and(inArray(quotations.status, ["won", "lost"]), gte(quotations.closedAt, monthStartTs), ...monthConds)).groupBy(quotations.status),
    db.select({ sentMonth: count() }).from(quotations).where(and(gte(quotations.sentAt, monthStartTs), ...monthConds)),
    db.select({ fuMonth: count() }).from(followUps).innerJoin(quotations, eq(quotations.id, followUps.quotationId))
      .where(and(gte(followUps.date, monthStart), ...monthConds)),
  ]);

  // last follow-up per quotation
  const ids = rows.map((r) => r.id);
  const fus = ids.length
    ? await db.select({ quotationId: followUps.quotationId, date: followUps.date, mode: followUps.mode, outcome: followUps.outcome, notes: followUps.notes })
      .from(followUps).where(inArray(followUps.quotationId, ids)).orderBy(desc(followUps.date), desc(followUps.id))
    : [];
  const last = new Map<number, LastFu>();
  const fuCount = new Map<number, number>();
  for (const f of fus) {
    if (!last.has(f.quotationId)) last.set(f.quotationId, f);
    fuCount.set(f.quotationId, (fuCount.get(f.quotationId) ?? 0) + 1);
  }

  const overdue = rows.filter((r) => r.nextFollowUpDate && r.nextFollowUpDate < today);
  const dueToday = rows.filter((r) => r.nextFollowUpDate === today);
  const upcoming = rows.filter((r) => r.nextFollowUpDate && r.nextFollowUpDate > today && r.nextFollowUpDate <= in7);
  const later = rows.filter((r) => r.nextFollowUpDate && r.nextFollowUpDate > in7);
  const unscheduled = rows.filter((r) => !r.nextFollowUpDate).sort((a, b) => (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0));

  const wonM = closedMonth.find((c) => c.status === "won");
  const lostM = closedMonth.find((c) => c.status === "lost");
  const wonN = Number(wonM?.n ?? 0), lostN = Number(lostM?.n ?? 0);
  const conv = wonN + lostN ? (wonN / (wonN + lostN)) * 100 : null;
  const qs = (patch: { sp?: string; bucket?: string }) => {
    const p = new URLSearchParams();
    for (const [key, v] of Object.entries({ sp: sp.sp, bucket: sp.bucket, ...patch })) if (v) p.set(key, v);
    const q = p.toString();
    return q ? `/follow-ups?${q}` : "/follow-ups";
  };
  const back = qs({});
  const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const sum = (list: Row[]) => list.reduce((s, r) => s + r.grandTotal, 0);
  const bucket: Bucket | null = (BUCKETS as readonly string[]).includes(sp.bucket ?? "") ? (sp.bucket as Bucket) : null;
  const sections: { key: Bucket; title: string; list: Row[]; empty: string }[] = [
    { key: "overdue", title: "Overdue", list: overdue, empty: "Nothing overdue. Great work." },
    { key: "today", title: "Due today", list: dueToday, empty: "No follow-ups due today." },
    { key: "upcoming", title: "Next 7 days", list: upcoming, empty: "Nothing scheduled for the next 7 days." },
    { key: "none", title: "No follow-up scheduled", list: unscheduled, empty: "Every open quotation has a next follow-up date." },
    { key: "later", title: "Later", list: later, empty: "Nothing scheduled beyond the next 7 days." },
  ];
  const pills: FilterPillItem[] = [
    { label: "All open", href: qs({ bucket: undefined }), active: !bucket, count: rows.length, hint: rows.length ? moneyShort(sum(rows)) : undefined },
    ...sections.map((x) => ({
      label: x.title, href: qs({ bucket: x.key }), active: bucket === x.key, count: x.list.length,
      hint: x.list.length ? moneyShort(sum(x.list)) : undefined, attention: (x.key === "overdue" || x.key === "today") && x.list.length > 0,
    })),
  ];
  // Without a bucket filter, "Later" only shows when it has quotations (it is the least urgent list).
  const shown = bucket ? sections.filter((x) => x.key === bucket) : sections.filter((x) => x.key !== "later" || x.list.length > 0);

  function renderRow(r: Row) {
    const lf = last.get(r.id);
    const sentDays = r.sentAt ? daysBetween(istDate(r.sentAt), today) : null;
    const wa = whatsappLink(r.phone, `Dear ${r.contactPerson || r.customerName || "Sir/Madam"}, following up on our quotation ${r.number}${r.projectName ? ` for ${r.projectName}` : ""} (₹${Math.round(r.grandTotal).toLocaleString("en-IN")}). Kindly let us know your feedback or if you need any clarification. Regards, ${user.name}, Linga Bhairavi Enterprise`);
    const tel = telLink(r.phone);
    const late = r.nextFollowUpDate && r.nextFollowUpDate < today ? daysBetween(r.nextFollowUpDate, today) : 0;
    return (
      <li key={r.id} className="p-4 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/quotations/${r.id}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{r.number}</Link>
              <StatusPill status={r.status} />
              {late > 0 && <StatusPill status="overdue" label={`${late} day${late === 1 ? "" : "s"} overdue`} />}
            </div>
            <p className="mt-0.5 text-sm text-ink">{r.customerName ?? "-"}{r.contactPerson && <span className="text-ink-soft"> · {r.contactPerson}</span>}</p>
            {r.projectName && <p className="truncate text-caption text-ink-soft">{r.projectName}</p>}
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="font-semibold tabular-nums text-ink">{money(r.grandTotal)}</p>
            <p className="text-caption text-ink-soft">
              {sentDays != null ? `Sent ${sentDays} day${sentDays === 1 ? "" : "s"} ago` : "Sent date unknown"}
              {r.nextFollowUpDate && <> · next {fmtDate(r.nextFollowUpDate)}</>}
            </p>
            {r.preparedBy && <p className="text-caption text-ink-faint">By {r.preparedBy}</p>}
          </div>
        </div>

        <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          {lf ? (
            <>
              <p className="text-caption font-medium text-ink-soft">Last follow-up {fmtDate(lf.date)} · {FOLLOWUP_MODE_LABEL[lf.mode] ?? lf.mode}{lf.outcome ? ` · ${FOLLOWUP_OUTCOME_LABEL[lf.outcome] ?? lf.outcome}` : ""} ({fuCount.get(r.id)} in total)</p>
              {lf.notes && <p className="mt-0.5 line-clamp-2 text-ink">{lf.notes}</p>}
            </>
          ) : <p className="text-ink-soft">No follow-up logged yet.</p>}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {tel
            ? <a href={tel} className={buttonClass("secondary", "sm")}><Phone className="icon-sm" aria-hidden /> {r.phone}</a>
            : <span className="text-caption text-ink-faint">No phone on record</span>}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm", "border-success-line text-success hover:border-success-line hover:bg-success-soft")}>
              <MessageCircle className="icon-sm" aria-hidden /> WhatsApp
            </a>
          )}
          {quoteWritable && (
            <LinkButton href={`/quotations/${r.id}?action=won#won`} variant="secondary" size="sm"><CheckCircle2 className="icon-sm text-success" aria-hidden /> Mark won</LinkButton>
          )}
        </div>

        {(writable || quoteWritable) && (
          <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_20rem]">
            {writable && (
              <details className="group rounded-xl border border-line">
                <summary className="flex cursor-pointer select-none items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-brand-700 hover:bg-muted dark:text-brand-300">
                  <CalendarClock className="icon-sm" aria-hidden /> Log a call
                </summary>
                <div className="border-t border-line p-3"><FollowUpForm quotationId={r.id} back={back} idPrefix={`fu${r.id}`} compact /></div>
              </details>
            )}
            {quoteWritable && (
              <details className="rounded-xl border border-line">
                <summary className="flex cursor-pointer select-none items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-danger hover:bg-muted">
                  <XCircle className="icon-sm" aria-hidden /> Mark lost
                </summary>
                <div className="border-t border-line p-3"><LostForm quotationId={r.id} back={back} idPrefix={`lost${r.id}`} /></div>
              </details>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <ListPage
      title="Follow-ups"
      subtitle="Every sent quotation: who it went to, when to call next, and whether it converted."
      notices={<Flash ok={sp.ok} err={sp.err} />}
      density={false}
      stats={
        <MetricStrip>
          <Metric label="Overdue" value={overdue.length} tone={overdue.length ? "bad" : "good"} hint={moneyShort(sum(overdue))}
            href={qs({ bucket: "overdue" })} />
          <Metric label="Due today" value={dueToday.length} tone={dueToday.length ? "warn" : "default"} hint={moneyShort(sum(dueToday))}
            href={qs({ bucket: "today" })} />
          <Metric label={`Won in ${monthLabel}`} value={wonN} tone="good"
            hint={`${moneyShort(wonM?.value ?? 0)} · ${lostN} lost · ${conv == null ? "no closes yet" : `${pct(conv, 0)} conversion`}`} />
          <Metric label="Activity this month" value={Number(fuMonth)} hint={`Follow-ups logged · ${Number(sentMonth)} quotations sent`} />
        </MetricStrip>
      }
      filters={
        <>
          <FilterPills label="Filter by follow-up date" items={pills} />
          <ListFilters searchName={false} clearHref={qs({ sp: undefined })} activeCount={sp.sp ? 1 : 0} hidden={{ bucket: bucket ?? undefined }}>
            <Select name="sp" defaultValue={sp.sp ?? ""} aria-label="Salesperson">
              <option value="">Everyone</option>
              <option value="me">My quotations</option>
              {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </ListFilters>
        </>
      }
      isEmpty={rows.length === 0}
      empty={
        <ListEmpty filtered={!!spId} noun="open quotations" clearHref={qs({ sp: undefined })} title={spId ? "No open quotations for this salesperson" : "No open quotations to follow up"}
          action={<LinkButton href="/quotations">Go to quotations</LinkButton>}>
          Quotations appear here once they are marked as sent.
        </ListEmpty>
      }
    >
      <div className="space-y-4">
        {shown.map((x) => (
          <SectionCard key={x.key} id={`bucket-${x.key}`} title={x.title} count={x.list.length} flush
            description={x.list.length ? `${moneyShort(sum(x.list))} in open quotations` : undefined}
            empty={x.list.length === 0 && x.empty}>
            <ul className="divide-y divide-line">{x.list.map((r) => renderRow(r))}</ul>
          </SectionCard>
        ))}
      </div>
    </ListPage>
  );
}
