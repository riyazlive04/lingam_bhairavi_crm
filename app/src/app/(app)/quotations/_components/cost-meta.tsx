/**
 * Rule 10: "Cost ₹2,460 · 07 Mar 2026 · Sri Balaji Steel" under a quotation line, with a warning "Stale" chip
 * when the purchase price is older than the item's stale window. No hooks, so it renders in server and client
 * components alike. Pass `cost = null` to hide the buying price (the date and source are still shown).
 */
import { cx } from "@/components/ui";
import { StatusPill } from "@/components/patterns";
import { fmtDate, money } from "@/lib/format";
import { costAgeDays, isCostStale, staleDaysFor, type CostSource } from "@/lib/pricing";

export type CostMetaProps = {
  cost: number | null;
  costDate: string | null;
  vendorName: string | null;
  source: CostSource | null;
  volatile: boolean;
  /** today's date (YYYY-MM-DD, IST) passed from the server so server and client render the same */
  today: string;
  className?: string;
};

export function costMetaText({ cost, costDate, vendorName, source }: Pick<CostMetaProps, "cost" | "costDate" | "vendorName" | "source">): string {
  const parts: string[] = [];
  if (cost != null) parts.push(`Cost ${money(cost)}`);
  if (source === "purchase") {
    if (costDate) parts.push(cost == null ? `Bought ${fmtDate(costDate)}` : fmtDate(costDate));
    else parts.push("Purchase price, date not recorded");
    if (vendorName) parts.push(vendorName);
  } else if (source === "list") {
    parts.push("List price", "not yet purchased");
  } else if (source === "manual") {
    parts.push("Entered manually");
    if (costDate) parts.push(fmtDate(costDate));
  } else {
    parts.push("Price date not recorded");
  }
  return parts.join(" · ");
}

export function CostMeta(p: CostMetaProps) {
  const stale = p.source === "purchase" && isCostStale(p.costDate, p.volatile, p.today);
  const age = stale ? costAgeDays(p.costDate, p.today) : null;
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-1.5 text-xs text-ink-faint", p.className)}>
      <span>{costMetaText(p)}</span>
      {stale && (
        <span title={`Last bought ${age} days ago. Prices older than ${staleDaysFor(p.volatile)} days are treated as stale${p.volatile ? " for this fast-moving item" : ""}.`}>
          <StatusPill semantic="warning" label={`Stale, ${age} days`} noDot />
        </span>
      )}
    </span>
  );
}
