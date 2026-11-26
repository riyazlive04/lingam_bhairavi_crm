import type { BuyVsSellRow } from "@/lib/reports";
import { money, pct, qty, round2 } from "@/lib/format";
import { cx } from "@/components/ui";
import { Callout, ResponsiveTable, StatusPill, type Column } from "@/components/patterns";

const SOURCE: Record<string, string> = { invoice: "invoiced", order: "customer PO", quotation: "quotation" };

/** Per item used on the project: average buying rate vs selling rate. Management only (shows buying prices). */
export function BuyVsSellTable({ rows }: { rows: BuyVsSellRow[] }) {
  if (!rows.length) {
    return <p className="px-4 py-6 text-center text-sm text-ink-soft sm:px-5">No materials have gone to this site yet, so there is nothing to compare.</p>;
  }
  const below = rows.filter((r) => r.belowCost).length;
  const priced = rows.filter((r) => r.marginTotal != null);
  const totalMargin = round2(priced.reduce((a, r) => a + (r.marginTotal ?? 0), 0));
  const unpriced = rows.length - priced.length;
  const cols: Column<BuyVsSellRow>[] = [
    {
      key: "item", header: "Item", card: "title", className: "max-w-72 whitespace-normal",
      cell: (r) => <><div className="font-medium">{r.name}</div><div className="text-caption font-normal text-ink-soft">{r.code}</div></>,
    },
    { key: "flag", header: <span className="sr-only">Check</span>, label: "Check", card: "badge", cell: (r) => (r.belowCost ? <StatusPill semantic="danger" label="Below cost" /> : null) },
    {
      key: "qty", header: "Qty used", align: "right", nowrap: true,
      cell: (r) => <>{qty(r.netQty)} {r.uom}{r.qtyBack > 0 && <div className="text-caption text-ink-soft">{qty(r.qtyIssued)} issued, {qty(r.qtyBack)} back</div>}</>,
    },
    { key: "buy", header: "Avg buying rate", align: "right", nowrap: true, cell: (r) => money(r.buyRate) },
    {
      key: "sell", header: "Selling rate", align: "right", nowrap: true,
      cell: (r) => <>{r.sellRate == null ? <span className="text-ink-faint">Not priced</span> : money(r.sellRate)}{r.sellSource && <div className="text-caption text-ink-soft">from {SOURCE[r.sellSource]}</div>}</>,
    },
    {
      key: "unit", header: "Margin per unit", align: "right", nowrap: true,
      cell: (r) => (
        <span className={cx(r.belowCost ? "font-semibold text-danger" : "text-ink")}>
          {r.marginPerUnit == null ? "-" : money(r.marginPerUnit)}
          {r.marginPct != null && <span className="block text-caption font-normal text-ink-soft">{pct(r.marginPct)}</span>}
        </span>
      ),
    },
    {
      key: "total", header: "Margin total", align: "right", card: "amount", nowrap: true,
      cell: (r) => <span className={cx("font-medium", (r.marginTotal ?? 0) < 0 ? "text-danger" : "text-ink")}>{r.marginTotal == null ? "-" : money(r.marginTotal)}</span>,
    },
  ];
  return (
    <>
      {below > 0 && (
        <div className="p-4 pb-0 sm:px-5">
          <Callout tone="danger" title={`${below} item${below === 1 ? " is" : "s are"} sold below cost`}>
            We are selling {below === 1 ? "it" : "them"} for less than we paid. Check the selling rate on the invoice or customer PO.
          </Callout>
        </div>
      )}
      <ResponsiveTable flush rows={rows} columns={cols} rowKey={(r) => r.itemId} caption="Buy vs sell" rowClassName={(r) => r.belowCost && "bg-danger-soft"}
        footer={
          <tr className="bg-muted font-semibold">
            <td className="ui-td" colSpan={6}>Material margin on priced items{unpriced ? ` (${unpriced} not priced yet)` : ""}</td>
            <td className={cx("ui-td text-right tabular-nums", totalMargin < 0 ? "text-danger" : "text-ink")}>{money(totalMargin)}</td>
          </tr>
        } />
      <p className="border-t border-line px-4 py-2 text-caption text-ink-soft sm:px-5">
        Buying rate is the average of what was issued to site. Selling rate comes from this project&apos;s invoices, else its customer PO, else the quotation supply rate. Labour and erection are not included.
      </p>
    </>
  );
}
