/**
 * Data table that turns into stacked cards below 640px (one table in the HTML, CSS does the rest,
 * see ".rt" in globals.css). Server-safe: `cell` functions run on the server.
 * Maintainer: Sirah Digital.
 */
import type { ReactNode } from "react";
import { Td, Th, cx } from "../ui";

/** Where a column goes when the row becomes a card on a phone. */
export type CardSlot = "title" | "subtitle" | "badge" | "amount" | "field" | "actions" | "hidden";

export type Column<T> = {
  key: string;
  header: ReactNode;
  /** Label used on the phone card when `header` is not plain text. */
  label?: string;
  cell: (row: T, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  /**
   * 1 = always visible (the default), 2 = visible on tablet and up (same as 1 in the table),
   * 3 = desktop only (hidden from 640px to 1023px; on phones it still shows in the card unless card is "hidden").
   */
  priority?: 1 | 2 | 3;
  /** Phone card placement. Default "field" (label on the left, value on the right). */
  card?: CardSlot;
  className?: string;
  headerClassName?: string;
  /** Keep the cell on one line (dates, numbers, document numbers). */
  nowrap?: boolean;
};

export type ResponsiveTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string | number;
  rowClassName?: (row: T, index: number) => string | undefined | false;
  /** Optional row id (for #anchor links), e.g. (r) => `line-${r.id}`. */
  rowId?: (row: T) => string;
  /** Rendered as <tfoot>; put <tr><Td>...</Td></tr> rows here (totals). */
  footer?: ReactNode;
  caption?: string;
  /** Limit height and keep the header sticky (long lists). */
  tall?: boolean;
  /** Drop the outer border and radius (when the table sits inside a SectionCard). */
  flush?: boolean;
  className?: string;
};

/**
 * @example
 * const columns: Column<Row>[] = [
 *   { key: "no", header: "Quotation", card: "title", nowrap: true,
 *     cell: (r) => <Link className="rt-stretch font-medium text-brand-700" href={`/quotations/${r.id}`}>{r.number}</Link> },
 *   { key: "customer", header: "Customer", card: "subtitle", cell: (r) => r.customerName },
 *   { key: "status", header: "Status", card: "badge", cell: (r) => <StatusPill status={r.status} /> },
 *   { key: "value", header: "Value", align: "right", card: "amount", nowrap: true, cell: (r) => money(r.grandTotal) },
 *   { key: "by", header: "Prepared by", priority: 3, cell: (r) => r.preparedBy ?? "-" },
 * ];
 * <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} />
 */
export function ResponsiveTable<T>({ rows, columns, rowKey, rowClassName, rowId, footer, caption, tall, flush, className }: ResponsiveTableProps<T>) {
  const alignCls = (a?: Column<T>["align"]) => (a === "right" ? "text-right" : a === "center" ? "text-center" : undefined);
  return (
    <div className={cx("ui-table-wrap bg-surface", flush ? "rounded-none border-0" : "rounded-2xl border border-line shadow-sm", tall && "ui-table-tall", className)}>
      <table className="ui-table rt">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <Th key={c.key} className={cx(alignCls(c.align), c.priority === 3 && "rt-p3", c.headerClassName)}>{c.header}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} id={rowId?.(r)} className={rowClassName?.(r, i) || undefined}>
              {columns.map((c) => (
                <Td
                  key={c.key}
                  data-slot={c.card ?? "field"}
                  data-label={c.label ?? (typeof c.header === "string" ? c.header : c.key)}
                  className={cx(alignCls(c.align), c.nowrap && "whitespace-nowrap", c.align === "right" && "tabular-nums", c.priority === 3 && "rt-p3", c.className)}
                >
                  {c.cell(r, i)}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
