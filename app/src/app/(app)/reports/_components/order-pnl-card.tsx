import { AlertTriangle, LineChart } from "lucide-react";
import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { canSeeCost } from "@/lib/rbac";
import { money, pct } from "@/lib/format";
import { orderPnl } from "@/lib/reports";
import { Card, cx } from "@/components/ui";

/**
 * Order profit and loss (rule 17) for the order page. Server component; renders nothing for roles that
 * may not see buying prices, so it is safe to drop in anywhere:  <OrderPnlCard orderId={order.id} />
 */
export async function OrderPnlCard({ orderId }: { orderId: number }) {
  const user = await getSession();
  if (!user || !canSeeCost(user.role)) return null;
  const db = await getDb();
  const r = await orderPnl(db, { orderId });
  if (!r) return null;
  const loss = r.grossProfit < 0;

  return (
    <Card title="Profit on this order" icon={LineChart} subtitle={r.supplyOnly ? "Supply order" : `Project order${r.projectCode ? ` · ${r.projectCode}` : ""}`}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs font-medium text-ink-soft">Revenue</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink">{money(r.revenue)}</dd>
          {r.creditNotes > 0 && <dd className="text-xs text-ink-soft">after {money(r.creditNotes)} credit notes</dd>}
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-soft">Cost of goods</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink">{money(r.cost)}</dd>
          {r.returnedCost > 0 && <dd className="text-xs text-ink-soft">after {money(r.returnedCost)} returned to stock</dd>}
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-soft">Gross profit</dt>
          <dd className={cx("mt-0.5 font-semibold tabular-nums", loss ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>{money(r.grossProfit)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-soft">Margin</dt>
          <dd className={cx("mt-0.5 font-semibold tabular-nums", loss ? "text-red-600 dark:text-red-400" : "text-ink")}>{r.revenue ? pct(r.marginPct) : "-"}</dd>
          <dd className="text-xs text-ink-soft">{pct(r.deliveredPct, 0)} delivered</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink-soft">Revenue is invoiced value before GST less credit notes. Cost is what the delivered goods cost us on the day they went out.</p>
      {r.linesWithoutCost > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {r.linesWithoutCost} delivered line{r.linesWithoutCost === 1 ? " has" : "s have"} no cost recorded, so the real profit is lower than shown. Add a purchase rate for those items.
        </p>
      )}
      {r.revenue === 0 && r.cost > 0 && (
        <p className="mt-2 text-xs text-ink-soft">Goods have gone out but nothing is invoiced yet, so this shows a loss until you bill it.</p>
      )}
    </Card>
  );
}
