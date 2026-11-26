import { LineChart } from "lucide-react";
import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { canSeeCost } from "@/lib/rbac";
import { money, pct } from "@/lib/format";
import { orderPnl } from "@/lib/reports";
import { cx } from "@/components/ui";
import { Callout, KeyValueGrid, SectionCard } from "@/components/patterns";

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
    <SectionCard title="Profit on this order" icon={LineChart} description={r.supplyOnly ? "Supply order" : `Project order${r.projectCode ? ` · ${r.projectCode}` : ""}`}>
      <KeyValueGrid columns={2} className="tabular-nums" items={[
        { label: "Revenue", value: money(r.revenue), hint: r.creditNotes > 0 ? `After ${money(r.creditNotes)} credit notes` : undefined },
        { label: "Cost of goods", value: money(r.cost), hint: r.returnedCost > 0 ? `After ${money(r.returnedCost)} returned to stock` : undefined },
        { label: "Gross profit", value: <span className={cx("font-semibold", loss ? "text-danger" : "text-success")}>{money(r.grossProfit)}</span> },
        { label: "Margin", value: <span className={cx("font-semibold", loss && "text-danger")}>{r.revenue ? pct(r.marginPct) : "-"}</span>, hint: `${pct(r.deliveredPct, 0)} delivered` },
      ]} />
      <p className="mt-3 text-caption text-ink-soft">Revenue is invoiced value before GST less credit notes. Cost is what the delivered goods cost us on the day they went out.</p>
      {r.linesWithoutCost > 0 && (
        <Callout tone="warning" className="mt-3" title={`${r.linesWithoutCost} delivered line${r.linesWithoutCost === 1 ? " has" : "s have"} no cost recorded`}>
          The real profit is lower than shown. Add a purchase rate for those items.
        </Callout>
      )}
      {r.revenue === 0 && r.cost > 0 && (
        <p className="mt-2 text-caption text-ink-soft">Goods have gone out but nothing is invoiced yet, so this shows a loss until you bill it.</p>
      )}
    </SectionCard>
  );
}
