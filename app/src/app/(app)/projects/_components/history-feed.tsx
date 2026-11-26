import Link from "next/link";
import {
  Activity, ClipboardList, FileText, FolderKanban, History, Package, PhoneCall, Receipt, ShoppingCart, StickyNote, Truck, Undo2, Wallet, Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button, EmptyState, Select, StatusBadge, cx } from "@/components/ui";
import { fmtDate, money } from "@/lib/format";
import { HISTORY_TYPES, type HistoryEvent, type HistoryType } from "../_lib/history";

const ICON: Record<HistoryType, LucideIcon> = {
  quotation: FileText, order: FolderKanban, vendor_po: ClipboardList, purchase: ShoppingCart, material: Package, delivery: Truck,
  invoice: Receipt, payment: Wallet, credit_note: Undo2, expense: Receipt, amc: Wrench, service: PhoneCall, note: StickyNote, activity: Activity,
};
const TONE: Partial<Record<HistoryType, string>> = {
  quotation: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  order: "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300",
  invoice: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  payment: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  credit_note: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  expense: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  vendor_po: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  purchase: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  material: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
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

/** Filter bar (plain GET form, no JS needed). */
export function HistoryFilters({ action, events, filter, hidden }: {
  action: string; events: HistoryEvent[]; filter: ReturnType<typeof historyFilter>; hidden?: Record<string, string>;
}) {
  const counts = new Map<HistoryType, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const present = (Object.keys(HISTORY_TYPES) as HistoryType[]).filter((t) => counts.has(t));
  return (
    <form method="get" action={action} className="no-print mb-4 rounded-2xl border border-line bg-surface p-3 shadow-xs">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-ink-soft">Show (leave all unticked to see everything)</legend>
        <div className="flex flex-wrap gap-2">
          {present.map((t) => (
            <label key={t} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:has-[:checked]:bg-brand-950/60">
              <input type="checkbox" name="t" value={t} defaultChecked={filter.types.includes(t)} className="h-3.5 w-3.5 accent-brand-600" />
              {HISTORY_TYPES[t]} <span className="text-ink-faint">{counts.get(t)}</span>
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
      </div>
    </form>
  );
}

/** Vertical timeline grouped by day. */
export function HistoryFeed({ events }: { events: HistoryEvent[] }) {
  if (!events.length) {
    return <EmptyState icon={History} title="Nothing to show yet">Quotes, orders, material issues, invoices and payments for this project will appear here as they happen.</EmptyState>;
  }
  const days: { day: string; items: HistoryEvent[] }[] = [];
  for (const e of events) {
    const d = dayOf(e);
    const last = days.at(-1);
    if (last && last.day === d) last.items.push(e);
    else days.push({ day: d, items: [e] });
  }
  return (
    <ol className="space-y-5">
      {days.map((g) => (
        <li key={g.day} className="break-inside-avoid">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">{fmtDate(g.day)}</h3>
          <ol className="relative space-y-1 border-l border-line pl-5">
            {g.items.map((e) => {
              const Icon = ICON[e.type];
              const title = e.href ? <Link href={e.href} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{e.title}</Link> : <span className="font-medium text-ink">{e.title}</span>;
              return (
                <li key={e.key} className="relative rounded-xl px-2 py-2 hover:bg-muted/60">
                  <span className={cx("absolute -left-[33px] top-2 grid h-6 w-6 place-items-center rounded-full ring-4 ring-surface", TONE[e.type] ?? "bg-muted text-ink-soft")}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 text-sm">
                      <span className="sr-only">{HISTORY_TYPES[e.type]}: </span>
                      {title}
                      {e.status && <span className="ml-2 align-middle"><StatusBadge status={e.status} /></span>}
                      {e.detail && <p className="mt-0.5 break-words text-xs text-ink-soft">{e.detail}</p>}
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {e.dateOnly ? HISTORY_TYPES[e.type] : `${HISTORY_TYPES[e.type]} · ${timeIST(e.when)}`}
                        {e.who ? ` · ${e.who}` : ""}
                      </p>
                    </div>
                    {e.amount != null && (
                      <div className={cx("shrink-0 text-sm font-semibold tabular-nums", e.amount < 0 ? "text-red-600 dark:text-red-400" : "text-ink")}>{money(e.amount)}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
}
