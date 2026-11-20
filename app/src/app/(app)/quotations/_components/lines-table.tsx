/** BOQ table in the client's quotation format: BOQ Ref | Description | Qty | UOM | SUPPLY (Rate, Amount) | ERECTION (Rate, Amount) | Remarks. */
import { Fragment } from "react";
import { cx } from "@/components/ui";
import { money, qty } from "@/lib/format";
import type { QuoteTotals } from "@/lib/pricing";
import { groupBySection, numberToIndianWords, splitSection } from "@/lib/quotations";

export type TableLine = {
  id: number; section: string | null; boqRef: string | null; description: string; qty: number; uom: string;
  supplyRate: number; erectionRate: number; remarks: string | null;
};

export function QuoteLinesTable({ lines, totals, discountPct, gstPct, print }: {
  lines: TableLine[]; totals: QuoteTotals; discountPct: number; gstPct: number; print?: boolean;
}) {
  const cell = print ? "border border-gray-400 px-1.5 py-1 align-top" : "border border-line px-2 py-1.5 align-top";
  const head = print ? "border border-gray-400 bg-gray-100 px-1.5 py-1 text-[11px] font-semibold uppercase" : "border border-line bg-muted px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft";
  const num = "text-right tabular-nums whitespace-nowrap";
  const groups = groupBySection(lines.filter((l) => l.qty > 0));
  const totalRow = (label: string, supply: React.ReactNode, erection: React.ReactNode, strong?: boolean) => (
    <tr className={cx(strong && "font-semibold")}>
      <td colSpan={5} className={cx(cell, "text-right")}>{label}</td>
      <td className={cx(cell, num)}>{supply}</td>
      <td className={cell} />
      <td className={cx(cell, num)}>{erection}</td>
      <td className={cell} />
    </tr>
  );
  const sumRow = (label: string, value: React.ReactNode, strong?: boolean) => (
    <tr className={cx(strong && "font-semibold")}>
      <td colSpan={7} className={cx(cell, "text-right")}>{label}</td>
      <td colSpan={2} className={cx(cell, num, strong && (print ? "text-base" : "text-base text-ink"))}>{value}</td>
    </tr>
  );

  return (
    <div className={print ? "" : "overflow-x-auto rounded-xl border border-line bg-surface shadow-sm"}>
      <table className={cx("w-full border-collapse", print ? "text-[11px]" : "min-w-[960px] text-sm")}>
        <thead>
          <tr>
            <th rowSpan={2} className={cx(head, "w-16 text-left")}>BOQ Ref</th>
            <th rowSpan={2} className={cx(head, "text-left")}>Description</th>
            <th rowSpan={2} className={cx(head, "w-14 text-right")}>Qty</th>
            <th rowSpan={2} className={cx(head, "w-12 text-left")}>UOM</th>
            <th colSpan={2} className={cx(head, "text-center")}>Supply</th>
            <th colSpan={2} className={cx(head, "text-center")}>Erection</th>
            <th rowSpan={2} className={cx(head, print ? "w-20 text-left" : "w-40 text-left")}>Remarks</th>
          </tr>
          <tr>
            <th className={cx(head, "w-24 text-right")}>Rate</th>
            <th className={cx(head, "w-28 text-right")}>Amount</th>
            <th className={cx(head, "w-24 text-right")}>Rate</th>
            <th className={cx(head, "w-28 text-right")}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const { code, title } = splitSection(g.section);
            const sSup = g.lines.reduce((s, l) => s + l.qty * l.supplyRate, 0);
            const sErc = g.lines.reduce((s, l) => s + l.qty * l.erectionRate, 0);
            return (
              <Fragment key={g.section || "_"}>
                {g.section && (
                  <tr className={print ? "bg-gray-50" : "bg-muted/60"}>
                    <td className={cx(cell, "font-semibold")}>{code}</td>
                    <td colSpan={8} className={cx(cell, "font-semibold")}>{title}</td>
                  </tr>
                )}
                {g.lines.map((l) => (
                  <tr key={l.id} className="break-inside-avoid">
                    <td className={cx(cell, "whitespace-nowrap")}>{l.boqRef}</td>
                    <td className={cx(cell, "whitespace-pre-line")}>{l.description}</td>
                    <td className={cx(cell, num)}>{qty(l.qty)}</td>
                    <td className={cell}>{l.uom}</td>
                    <td className={cx(cell, num)}>{money(l.supplyRate)}</td>
                    <td className={cx(cell, num)}>{money(l.qty * l.supplyRate)}</td>
                    <td className={cx(cell, num)}>{l.erectionRate ? money(l.erectionRate) : "—"}</td>
                    <td className={cx(cell, num)}>{l.erectionRate ? money(l.qty * l.erectionRate) : "—"}</td>
                    <td className={cx(cell, print ? "text-[10px]" : "text-xs text-ink-soft")}>{l.remarks}</td>
                  </tr>
                ))}
                {g.section && groups.length > 1 && totalRow(`Total — ${title}`, money(sSup), money(sErc))}
              </Fragment>
            );
          })}
          {totalRow("Total (Supply / Erection)", money(totals.supply), money(totals.erection), true)}
          {sumRow("Total basic value (Supply + Erection)", money(totals.gross))}
          {totals.discount > 0 && sumRow(`Less: Discount @ ${discountPct}%`, `− ${money(totals.discount)}`)}
          {totals.discount > 0 && sumRow("Net taxable value", money(totals.taxable))}
          {sumRow(`GST @ ${gstPct}%`, money(totals.tax))}
          {sumRow("Grand total", money(totals.grand), true)}
          <tr>
            <td colSpan={9} className={cx(cell, "italic")}>Amount in words: {numberToIndianWords(totals.grand)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
