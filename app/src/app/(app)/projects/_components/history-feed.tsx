import Link from "next/link";
import {
  Activity, ClipboardList, FileText, FolderKanban, History, Package, PhoneCall, Receipt, ShoppingCart, StickyNote, Truck, Undo2, Wallet, Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button, EmptyState, Select, cx } from "@/components/ui";
import { StatusPill, StatusTimeline, type StatusSemantic, type TimelineItem } from "@/components/patterns";
import { fmtDate, money } from "@/lib/format";
import { HISTORY_TYPES, type HistoryEvent, type HistoryType } from "../_lib/history";

const ICON: Record<HistoryType, LucideIcon> = {
  quotation: FileText, order: FolderKanban, vendor_po: ClipboardList, purchase: ShoppingCart, material: Package, delivery: Truck,
  invoice: Receipt, payment: Wallet, credit_note: Undo2, expense: Receipt, amc: Wrench, service: PhoneCall, note: StickyNote, activity: Activity,
};
/** Icon colour per event kind: selling is info, buying is progress, money in is success, deductions are warning. */
const SEMANTIC: Partial<Record<HistoryType, StatusSemantic>> = {
  quotation: "info", order: "info", invoice: "success", payment: "success", credit_note: "warning", expense: "warning",
  vendor_po: "progress", purchase: "progress", material: "progress",
};

const timeIST = (s: string) => new Date(s).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const dayOf = (e: HistoryEvent) => (e.dateOnly ? e.when : new Date(new Date(e.when).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10));

export type HistorySP = { t?: string | string[]; order?: string };

/** Parse ?t=invoice&t=payment and ?order=oldest into a filter. */
export function historyFilter(sp: HistorySP) {
  const raw = Array.isArray(sp.t) ? sp.t : sp.t ? sp.t.split(",") : [];
  const types = raw.filter((t): t is HistoryType => t in HISTORY_TYPES);
  return { types, oldestFirst: sp.order === "oldest" };
}

export function applyHistoryFilter(events: HistoryEvent[], f: ReturnType<typeof historyFilter>) {
  const list = f.types.length ? events.filter((e) => f.types.includes(e.type)) : events;
  return f.oldestFirst ? [...list].reverse() : list;
}

/**
 * Multi-select filter for the history (plain GET form, works without JavaScript).
 * Styled like ListFilters and FilterPills; the kit has no multi-select chip filter yet.
 */
export function HistoryFilters({ action, events, filter, hidden }: {
  action: string; events: HistoryEvent[]; filter: ReturnType<typeof historyFilter>; hidden?: Record<string, string>;
}) {
  const counts = new Map<HistoryType, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const present = (Object.keys(HISTORY_TYPES) as HistoryType[]).filter((t) => counts.has(t));
  const clearHref = action + (hidden ? `?${new URLSearchParams(hidden).toString()}` : "");
  const active = filter.types.length + (filter.oldestFirst ? 1 : 0);
  return (
    <form method="get" action={action} role="search" className="no-print rounded-2xl border border-line bg-surface p-3 shadow-xs">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <fieldset>
        <legend className="mb-2 text-caption font-medium text-ink-soft">Show only these (leave all unticked to see everything)</legend>
        <div className="flex flex-wrap gap-2">
          {present.map((t) => (
            <label key={t} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink-soft hover:border-line-strong hover:text-ink has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700 dark:has-[:checked]:bg-brand-950/60 dark:has-[:checked]:text-brand-200">
              <input type="checkbox" name="t" value={t} defaultChecked={filter.types.includes(t)} className="icon-xs accent-brand-600" />
              {HISTORY_TYPES[t]}
              <span className="rounded-full bg-muted px-1.5 text-[11px] leading-[18px] tabular-nums text-ink-soft">{counts.get(t)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select name="order" defaultValue={filter.oldestFirst ? "oldest" : "newest"} aria-label="Order" className="sm:max-w-44">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
        <Button type="submit" variant="secondary">Apply</Button>
        {active > 0 && (
          <Link href={clearHref} className="inline-flex h-9.5 items-center justify-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-muted hover:text-ink">Clear</Link>
        )}
      </div>
    </form>
  );
}

function toItem(e: HistoryEvent): TimelineItem {
  const title = e.href
    ? <Link href={e.href} className="text-brand-700 hover:underline dark:text-brand-300">{e.title}</Link>
    : e.title;
  return {
    id: e.key,
    icon: ICON[e.type],
    semantic: SEMANTIC[e.type] ?? "neutral",
    title: (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="sr-only">{HISTORY_TYPES[e.type]}: </span>
        {title}
        {e.status && <StatusPill status={e.status} />}
      </span>
    ),
    at: e.dateOnly ? undefined : timeIST(e.when),
    by: [HISTORY_TYPES[e.type], e.who].filter(Boolean).join(" · "),
    body: (e.detail || e.amount != null) ? (
      <>
        {e.detail && <p className="break-words">{e.detail}</p>}
        {e.amount != null && <p className={cx("font-semibold tabular-nums", e.amount < 0 ? "text-danger" : "text-ink")}>{money(e.amount)}</p>}
      </>
    ) : undefined,
  };
}

/** Project history: one StatusTimeline per day. */
export function HistoryFeed({ events }: { events: HistoryEvent[] }) {
  if (!events.length) {
    return <EmptyState icon={History} title="Nothing to show yet">Quotes, orders, material issues, invoices and payments for this project appear here as they happen.</EmptyState>;
  }
  const days: { day: string; items: HistoryEvent[] }[] = [];
  for (const e of events) {
    const d = dayOf(e);
    const last = days.at(-1);
    if (last && last.day === d) last.items.push(e);
    else days.push({ day: d, items: [e] });
  }
  return (
    <div className="space-y-6">
      {days.map((g) => (
        <section key={g.day} aria-label={fmtDate(g.day)}>
          <h3 className="mb-3 text-overline uppercase text-ink-soft">{fmtDate(g.day)}</h3>
          <StatusTimeline items={g.items.map(toItem)} />
        </section>
      ))}
    </div>
  );
}
