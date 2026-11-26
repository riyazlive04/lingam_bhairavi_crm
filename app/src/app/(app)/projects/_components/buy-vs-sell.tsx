import { AlertTriangle } from "lucide-react";
import type { BuyVsSellRow } from "@/lib/reports";
import { money, pct, qty, round2 } from "@/lib/format";
import { Badge, Table, Td, Th, cx } from "@/components/ui";

const SOURCE: Record<string, string> = { invoice: "invoiced", order: "customer PO", quotation: "quotation" };

/** Per item used on the project: average buying rate vs selling rate. Management only (shows buying prices). */
export function BuyVsSellTable({ rows }: { rows: BuyVsSellRow[] }) {
  if (!rows.length) {
    return <p className="p-4 text-sm text-ink-soft sm:p-5">No materials have gone to this site yet, so there is nothing to compare.</p>;
  }
  const below = rows.filter((r) => r.belowCost).length;
  const priced = rows.filter((r) => r.marginTotal != null);
  const totalMargin = round2(priced.reduce((a, r) => a + (r.marginTotal ?? 0), 0));
  const unpriced = rows.length - priced.length;
  return (
    <>
      {below > 0 && (
        <p className="flex items-center gap-2 border-b border-line bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {below} item{below === 1 ? " is" : "s are"} being sold below what we paid for {below === 1 ? "it" : "them"}.
        </p>
      )}
      <Table className="rounded-none border-0 shadow-none">
        <thead>
          <tr>
            <Th>Item</Th>
            <Th className="text-right">Qty used</Th>
            <Th className="text-right">Avg buying rate</Th>
            <Th className="text-right">Selling rate</Th>
            <Th className="text-right">Margin / unit</Th>
            <Th className="text-right">Margin total</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemId} className={cx(r.belowCost && "bg-red-50/60 dark:bg-red-950/20")}>
              <Td>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-ink-soft">{r.code}{r.belowCost && <Badge tone="red" className="ml-2">Below cost</Badge>}</div>
              </Td>
              <Td className="text-right tabular-nums">
                {qty(r.netQty)} {r.uom}
                {r.qtyBack > 0 && <div className="text-xs text-ink-soft">{qty(r.qtyIssued)} issued, {qty(r.qtyBack)} back</div>}
              </Td>
              <Td className="text-right tabular-nums">{money(r.buyRate)}</Td>
              <Td className="text-right tabular-nums">
                {r.sellRate == null ? <span className="text-ink-faint">not priced</span> : money(r.sellRate)}
                {r.sellSource && <div className="text-xs text-ink-soft">from {SOURCE[r.sellSource]}</div>}
              </Td>
              <Td className={cx("text-right tabular-nums", r.belowCost ? "font-semibold text-red-600 dark:text-red-400" : "text-ink")}>
                {r.marginPerUnit == null ? "-" : money(r.marginPerUnit)}
                {r.marginPct != null && <div className="text-xs text-ink-soft">{pct(r.marginPct)}</div>}
              </Td>
              <Td className={cx("text-right font-medium tabular-nums", (r.marginTotal ?? 0) < 0 ? "text-red-600 dark:text-red-400" : "text-ink")}>
                {r.marginTotal == null ? "-" : money(r.marginTotal)}
              </Td>
            </tr>
          ))}
          <tr className="bg-muted font-semibold">
            <Td colSpan={5}>Material margin on priced items{unpriced ? ` (${unpriced} not priced yet)` : ""}</Td>
            <Td className={cx("text-right tabular-nums", totalMargin < 0 ? "text-red-600 dark:text-red-400" : "text-ink")}>{money(totalMargin)}</Td>
          </tr>
        </tbody>
      </Table>
      <p className="border-t border-line px-4 py-2 text-xs text-ink-soft">
        Buying rate is the average of what was issued to site. Selling rate comes from this project&apos;s invoices, else its customer PO, else the quotation supply rate. Labour and erection are not included.
      </p>
    </>
  );
}
