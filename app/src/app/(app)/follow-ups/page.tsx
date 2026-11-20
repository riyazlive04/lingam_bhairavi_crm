import Link from "next/link";
import { and, asc, count, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import { CalendarClock, MessageCircle, Phone } from "lucide-react";
import { getDb } from "@/db";
import { customers, followUps, quotations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { addDays, daysBetween, fmtDate, money, moneyShort, pct, todayIST } from "@/lib/format";
import { FOLLOWUP_MODE_LABEL, FOLLOWUP_OUTCOME_LABEL, istDate, telLink, whatsappLink } from "@/lib/quotations";
import { Badge, EmptyState, Flash, LinkButton, PageHeader, Select, Stat, StatusBadge, Button, cx } from "@/components/ui";
import { FollowUpForm, LostForm } from "../quotations/_components/forms";

export const metadata = { title: "Follow-ups" };

type Row = {
  id: number; number: string; status: string; projectName: string | null; grandTotal: number; quoteDate: string; sentAt: Date | null;
  nextFollowUpDate: string | null; customerName: string | null; contactPerson: string | null; phone: string | null; preparedBy: string | null;
};
type LastFu = { date: string; mode: string; outcome: string | null; notes: string | null };


export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ sp?: string; ok?: string; err?: string }> }) {
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
  const back = `/follow-ups${sp.sp ? `?sp=${encodeURIComponent(sp.sp)}` : ""}`;
  const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const renderSection = (key: string, title: string, list: Row[], tone: "bad" | "warn" | "default" | "muted", emptyText: string, defaultOpen = true) => (
    <section aria-labelledby={`h-${key}`} className="mb-8">
      <h2 id={`h-${key}`} className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
        <span className={cx("h-2.5 w-2.5 rounded-full", tone === "bad" ? "bg-red-500" : tone === "warn" ? "bg-amber-500" : tone === "muted" ? "bg-gray-400" : "bg-blue-500")} aria-hidden />
        {title} <span className="text-sm font-normal text-ink-soft">({list.length}{list.length ? ` · ${moneyShort(list.reduce((s, r) => s + r.grandTotal, 0))}` : ""})</span>
      </h2>
      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface px-4 py-3 text-sm text-ink-soft">{emptyText}</p>
      ) : defaultOpen ? (
        <ul className="space-y-3">{list.map((r) => renderRow(r))}</ul>
      ) : (
        <details className="rounded-lg border border-line bg-surface p-3">
          <summary className="cursor-pointer text-sm text-brand-700">Show {list.length} quotation{list.length === 1 ? "" : "s"}</summary>
          <ul className="mt-3 space-y-3">{list.map((r) => renderRow(r))}</ul>
        </details>
      )}
    </section>
  );

  function renderRow(r: Row) {
    const lf = last.get(r.id);
    const sentDays = r.sentAt ? daysBetween(istDate(r.sentAt), today) : null;
    const wa = whatsappLink(r.phone, `Dear ${r.contactPerson || r.customerName || "Sir/Madam"}, following up on our quotation ${r.number}${r.projectName ? ` for ${r.projectName}` : ""} (₹${Math.round(r.grandTotal).toLocaleString("en-IN")}). Kindly let us know your feedback or if you need any clarification. Regards, ${user.name}, Linga Bhairavi Enterprise`);
    const tel = telLink(r.phone);
    const late = r.nextFollowUpDate && r.nextFollowUpDate < today ? daysBetween(r.nextFollowUpDate, today) : 0;
    return (
      <li key={r.id} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/quotations/${r.id}`} className="font-semibold text-brand-700 hover:underline">{r.number}</Link>
              <StatusBadge status={r.status} />
              {late > 0 && <Badge tone="red">{late} day{late === 1 ? "" : "s"} overdue</Badge>}
            </div>
            <div className="mt-0.5 text-sm text-ink">{r.customerName ?? "-"}{r.contactPerson && <span className="text-ink-soft"> · {r.contactPerson}</span>}</div>
            {r.projectName && <div className="truncate text-xs text-ink-soft">{r.projectName}</div>}
          </div>
          <div className="text-left sm:text-right">
            <div className="font-semibold tabular-nums text-ink">{money(r.grandTotal)}</div>
            <div className="text-xs text-ink-soft">
              {sentDays != null ? `Sent ${sentDays} day${sentDays === 1 ? "" : "s"} ago` : "Sent date unknown"}
              {r.nextFollowUpDate && <> · next {fmtDate(r.nextFollowUpDate)}</>}
            </div>
            {r.preparedBy && <div className="text-xs text-ink-faint">by {r.preparedBy}</div>}
          </div>
        </div>

        <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm">
          {lf ? (
            <>
              <span className="text-xs font-medium text-ink-soft">Last follow-up {fmtDate(lf.date)} · {FOLLOWUP_MODE_LABEL[lf.mode] ?? lf.mode}{lf.outcome ? ` · ${FOLLOWUP_OUTCOME_LABEL[lf.outcome] ?? lf.outcome}` : ""} ({fuCount.get(r.id)} total)</span>
              {lf.notes && <p className="mt-0.5 line-clamp-2 text-ink">{lf.notes}</p>}
            </>
          ) : <span className="text-ink-soft">No follow-up logged yet.</span>}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {tel ? <a href={tel} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-ink hover:bg-muted"><Phone className="h-4 w-4" aria-hidden /> {r.phone}</a>
            : <span className="text-xs text-ink-faint">No phone on record</span>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 px-3 text-sm text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"><MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp</a>}
          {quoteWritable && <LinkButton href={`/quotations/${r.id}?action=won#won`} variant="success" size="sm">Won</LinkButton>}
        </div>

        {(writable || quoteWritable) && (
          <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto]">
            {writable && (
              <details className="rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium text-brand-700"><CalendarClock className="mr-1 inline h-4 w-4" aria-hidden />Log follow-up</summary>
                <div className="mt-3"><FollowUpForm quotationId={r.id} back={back} idPrefix={`fu${r.id}`} compact /></div>
              </details>
            )}
            {quoteWritable && (
              <details className="rounded-lg border border-line p-3 lg:w-80">
                <summary className="cursor-pointer text-sm font-medium text-red-700 dark:text-red-400">Mark lost</summary>
                <div className="mt-3"><LostForm quotationId={r.id} back={back} idPrefix={`lost${r.id}`} /></div>
              </details>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <div>
      <PageHeader title="Follow-up tracker" subtitle="Every sent quotation: who it went to, when to call next, and whether it converted." />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "bad" : "good"} hint={moneyShort(overdue.reduce((s, r) => s + r.grandTotal, 0))} />
        <Stat label="Due today" value={dueToday.length} tone={dueToday.length ? "warn" : "default"} />
        <Stat label={`Won · ${monthLabel}`} value={wonN} tone="good" hint={moneyShort(wonM?.value ?? 0)} />
        <Stat label="Conversion (month)" value={conv == null ? "-" : pct(conv, 0)} hint={`${wonN} won / ${lostN} lost`} />
        <Stat label="Activity (month)" value={Number(fuMonth)} hint={`follow-ups · ${Number(sentMonth)} quotes sent`} />
      </div>

      <form method="get" className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="sp-filter" className="text-sm font-medium text-ink">Salesperson</label>
        <Select id="sp-filter" name="sp" defaultValue={sp.sp ?? ""} className="sm:max-w-xs">
          <option value="">Everyone</option>
          <option value="me">My quotations</option>
          {salespeople.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No open quotations to follow up" action={<LinkButton href="/quotations">Go to quotations</LinkButton>}>
          Quotations appear here once they are marked as sent.
        </EmptyState>
      ) : (
        <>
          {renderSection("overdue", "Overdue", overdue, "bad", "Nothing overdue. Great work!")}
          {renderSection("today", "Due today", dueToday, "warn", "No follow-ups due today.")}
          {renderSection("upcoming", "Upcoming 7 days", upcoming, "default", "Nothing scheduled for the next 7 days.")}
          {renderSection("none", "No follow-up scheduled", unscheduled, "muted", "Every open quotation has a next follow-up date.")}
          {later.length > 0 && renderSection("later", "Later", later, "muted", "", false)}
        </>
      )}
    </div>
  );
}
