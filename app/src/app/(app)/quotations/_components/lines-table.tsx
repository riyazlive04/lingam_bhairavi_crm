/**
 * BOQ table in the client's quotation format: BOQ ref | Description | Qty | UOM | Supply (rate, amount) | Erection (rate, amount) | Remarks.
 * Screen mode: a bordered sheet from 640px and a stacked card list on phones, with MoneySummary for totals.
 * Print mode: the same table on the DocumentSheet `doc-table` styles (black on white, header repeats per page).
 */
import { Fragment, type ReactNode } from "react";
import { MoneySummary } from "@/components/patterns";
import { cx } from "@/components/ui";
import { money, qty } from "@/lib/format";
import type { QuoteTotals } from "@/lib/pricing";
import { groupBySection, numberToIndianWords, splitSection } from "@/lib/quotations";

export type TableLine = {
  id: number; section: string | null; boqRef: string | null; description: string; qty: number; uom: string;
  supplyRate: number; erectionRate: number; remarks: string | null;
};

export function QuoteLinesTable<T extends TableLine>({ lines, totals, discountPct, gstPct, print, renderMeta }: {
  lines: T[]; totals: QuoteTotals; discountPct: number; gstPct: number; print?: boolean;
  /** internal extra under each description (e.g. cost source); never used on print / customer copies */
  renderMeta?: (line: T) => ReactNode;
}) {
  const groups = groupBySection(lines.filter((l) => l.qty > 0));
  return print
    ? <PrintTable groups={groups} totals={totals} discountPct={discountPct} gstPct={gstPct} />
    : <ScreenTable groups={groups} totals={totals} discountPct={discountPct} gstPct={gstPct} renderMeta={renderMeta} />;
}

type Groups<T> = { section: string; lines: T[] }[];
const sectionSums = (ls: TableLine[]) => ({
  supply: ls.reduce((s, l) => s + l.qty * l.supplyRate, 0),
  erection: ls.reduce((s, l) => s + l.qty * l.erectionRate, 0),
});

// ---------------------------------------------------------------- print (DocumentSheet)

function PrintTable<T extends TableLine>({ groups, totals, discountPct, gstPct }: { groups: Groups<T>; totals: QuoteTotals; discountPct: number; gstPct: number }) {
  const sumRow = (label: string, value: ReactNode, strong?: boolean) => (
    <tr className={cx(strong && "font-bold")}>
      <td colSpan={7} className="text-right">{label}</td>
      <td colSpan={2} className="num">{value}</td>
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table className="doc-table min-w-max text-[0.75rem] sm:min-w-0">
        <thead>
          <tr>
            <th rowSpan={2} className="w-14">BOQ ref</th>
            <th rowSpan={2}>Description</th>
            <th rowSpan={2} className="num w-12">Qty</th>
            <th rowSpan={2} className="w-10">UOM</th>
            <th colSpan={2} className="text-center">Supply</th>
            <th colSpan={2} className="text-center">Erection</th>
            <th rowSpan={2} className="w-20">Remarks</th>
          </tr>
          <tr>
            <th className="num">Rate</th><th className="num">Amount</th>
            <th className="num">Rate</th><th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const { code, title } = splitSection(g.section);
            const s = sectionSums(g.lines);
            return (
              <Fragment key={g.section || "_"}>
                {g.section && (
                  <tr>
                    <td className="font-semibold">{code}</td>
                    <td colSpan={8} className="font-semibold">{title}</td>
                  </tr>
                )}
                {g.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap">{l.boqRef}</td>
                    <td className="whitespace-pre-line">{l.description}</td>
                    <td className="num">{qty(l.qty)}</td>
                    <td>{l.uom}</td>
                    <td className="num">{money(l.supplyRate)}</td>
                    <td className="num">{money(l.qty * l.supplyRate)}</td>
                    <td className="num">{l.erectionRate ? money(l.erectionRate) : "-"}</td>
                    <td className="num">{l.erectionRate ? money(l.qty * l.erectionRate) : "-"}</td>
                    <td className="text-[0.6875rem]">{l.remarks}</td>
                  </tr>
                ))}
                {g.section && groups.length > 1 && (
                  <tr className="font-semibold">
                    <td colSpan={5} className="text-right">Total: {title}</td>
                    <td className="num">{money(s.supply)}</td><td />
                    <td className="num">{money(s.erection)}</td><td />
                  </tr>
                )}
              </Fragment>
            );
          })}
          <tr className="font-bold">
            <td colSpan={5} className="text-right">Total (supply and erection)</td>
            <td className="num">{money(totals.supply)}</td><td />
            <td className="num">{money(totals.erection)}</td><td />
          </tr>
          {sumRow("Total basic value (supply + erection)", money(totals.gross))}
          {totals.discount > 0 && sumRow(`Less: discount @ ${discountPct}%`, `- ${money(totals.discount)}`)}
          {totals.discount > 0 && sumRow("Net taxable value", money(totals.taxable))}
          {sumRow(`GST @ ${gstPct}%`, money(totals.tax))}
          {sumRow("Grand total", money(totals.grand), true)}
          <tr><td colSpan={9}><span className="text-[var(--doc-soft)]">Amount in words: </span><strong>{numberToIndianWords(totals.grand)}</strong></td></tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- screen

function ScreenTable<T extends TableLine>({ groups, totals, discountPct, gstPct, renderMeta }: {
  groups: Groups<T>; totals: QuoteTotals; discountPct: number; gstPct: number; renderMeta?: (line: T) => ReactNode;
}) {
  const cell = "border-b border-line px-2.5 py-2 align-top";
  const head = "border-b border-line bg-muted px-2.5 py-2 text-overline uppercase text-ink-soft";
  const num = "text-right tabular-nums whitespace-nowrap";
  const totalsBlock = (
    <MoneySummary
      rows={[{ label: "Supply total", value: totals.supply }, { label: "Erection total", value: totals.erection }]}
      discount={totals.discount}
      taxable={totals.discount > 0 ? totals.taxable : undefined}
      tax={totals.tax} taxLabel={`GST (${gstPct}%)`}
      total={totals.grand} totalLabel="Grand total"
      words={numberToIndianWords(totals.grand)}
      note={totals.discount > 0 ? `Discount of ${discountPct}% applied on the basic value.` : undefined}
    />
  );

  return (
    <div className="space-y-4">
      {/* 640px and wider: the BOQ sheet */}
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm sm:block">
        <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Bill of quantities</caption>
          <thead>
            <tr>
              <th scope="col" className={cx(head, "w-16 text-left")}>BOQ ref</th>
              <th scope="col" className={cx(head, "text-left")}>Description</th>
              <th scope="col" className={cx(head, "w-16 text-right")}>Qty</th>
              <th scope="col" className={cx(head, "w-14 text-left")}>UOM</th>
              <th scope="col" className={cx(head, "w-24 border-l text-right")}>Supply rate</th>
              <th scope="col" className={cx(head, "w-28 text-right")}>Supply amount</th>
              <th scope="col" className={cx(head, "w-24 border-l text-right")}>Erection rate</th>
              <th scope="col" className={cx(head, "w-28 text-right")}>Erection amount</th>
              <th scope="col" className={cx(head, "w-40 border-l text-left")}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const { code, title } = splitSection(g.section);
              const s = sectionSums(g.lines);
              return (
                <Fragment key={g.section || "_"}>
                  {g.section && (
                    <tr className="bg-surface-2">
                      <td className={cx(cell, "font-semibold text-ink")}>{code}</td>
                      <td colSpan={8} className={cx(cell, "font-semibold text-ink")}>
                        {title}
                        {groups.length > 1 && <span className="ml-3 text-caption font-normal text-ink-soft tabular-nums">Section total {money(s.supply + s.erection)}</span>}
                      </td>
                    </tr>
                  )}
                  {g.lines.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/40">
                      <td className={cx(cell, "whitespace-nowrap text-ink-soft")}>{l.boqRef}</td>
                      <td className={cx(cell, "whitespace-pre-line text-ink")}>
                        {l.description}
                        {renderMeta && <div className="mt-1 whitespace-normal">{renderMeta(l)}</div>}
                      </td>
                      <td className={cx(cell, num, "font-medium text-ink")}>{qty(l.qty)}</td>
                      <td className={cx(cell, "text-ink-soft")}>{l.uom}</td>
                      <td className={cx(cell, num, "border-l border-line")}>{money(l.supplyRate)}</td>
                      <td className={cx(cell, num)}>{money(l.qty * l.supplyRate)}</td>
                      <td className={cx(cell, num, "border-l border-line")}>{l.erectionRate ? money(l.erectionRate) : "-"}</td>
                      <td className={cx(cell, num)}>{l.erectionRate ? money(l.qty * l.erectionRate) : "-"}</td>
                      <td className={cx(cell, "border-l border-line text-caption text-ink-soft")}>{l.remarks}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-surface-2 font-semibold text-ink">
              <td colSpan={5} className="px-2.5 py-2 text-right">Total supply and erection</td>
              <td className={cx("px-2.5 py-2", num)}>{money(totals.supply)}</td>
              <td />
              <td className={cx("px-2.5 py-2", num)}>{money(totals.erection)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Phones: one card per line, grouped by section */}
      <div className="space-y-3 sm:hidden">
        {groups.map((g) => (
          <section key={g.section || "_"} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            {g.section && <h3 className="border-b border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink">{g.section}</h3>}
            <ul className="divide-y divide-line">
              {g.lines.map((l) => (
                <li key={l.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 whitespace-pre-line text-ink">{l.boqRef && <span className="mr-1.5 text-caption text-ink-faint">{l.boqRef}</span>}{l.description}</p>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">{money(l.qty * (l.supplyRate + l.erectionRate))}</span>
                  </div>
                  <p className="mt-1 text-caption text-ink-soft tabular-nums">
                    {qty(l.qty)} {l.uom} · supply {money(l.supplyRate)}{l.erectionRate ? ` · erection ${money(l.erectionRate)}` : ""}
                  </p>
                  {l.remarks && <p className="mt-0.5 text-caption text-ink-faint">{l.remarks}</p>}
                  {renderMeta && <div className="mt-1">{renderMeta(l)}</div>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="flex justify-end">
        <div className="w-full rounded-2xl border border-line bg-surface p-4 shadow-sm sm:max-w-sm sm:p-5">{totalsBlock}</div>
      </div>
    </div>
  );
}
