/**
 * Data table that turns into stacked cards below 640px (one table in the HTML, CSS does the rest,
 * see ".rt" in globals.css). Server-safe: `cell` functions run on the server.
 * Maintainer: Sirah Digital.
 */
import { Fragment, isValidElement, type ReactNode } from "react";
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

/** One cell of a footer row: a value, or a value with its own class / phone card slot. */
export type FooterCell = ReactNode | { value: ReactNode; className?: string; slot?: CardSlot };

/**
 * A totals row under the table. `cells` is keyed by column key, so values line up with their columns
 * on desktop and pick up each column's label on the phone card (where the row reads as a totals card).
 * The label fills the first column and spans every column before the first value.
 */
export type FooterRow = {
  key?: string;
  label: ReactNode;
  cells: Partial<Record<string, FooterCell>>;
  /** Align the label right (next to its value), e.g. "Subtotal" over the amount column. Default left. */
  labelAlign?: "left" | "right";
  labelClassName?: string;
  /** Row class. Default "bg-muted font-semibold" (pass "" for a plain row). */
  className?: string;
};

export type ResponsiveTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string | number;
  rowClassName?: (row: T, index: number) => string | undefined | false;
  /** Optional row id (for #anchor links), e.g. (r) => `line-${r.id}`. */
  rowId?: (row: T) => string;
  /** Totals rows, aligned to the columns and readable as a card on phones. Preferred over `footer`. */
  footerRows?: FooterRow[];
  /** Raw <tfoot> content (escape hatch). Use `footerRows` unless the layout really needs hand-written cells. */
  footer?: ReactNode;
  caption?: string;
  /** Limit height and keep the header sticky (long lists). */
  tall?: boolean;
  /** Drop the outer border and radius (when the table sits inside a SectionCard). */
  flush?: boolean;
  /**
   * false keeps a plain table that scrolls sideways on phones instead of turning rows into cards.
   * Only for grids that are read across, such as the size by price matrix. Default true.
   */
  cards?: boolean;
  /** Pin the first column while the table scrolls sideways (use with cards={false}). */
  stickyFirst?: boolean;
  /** Group rows under header rows. Rows must already be sorted by group. */
  groupBy?: (row: T) => string;
  /** Content of the group header row. Defaults to the group key. */
  groupHeader?: (group: string, rows: T[]) => ReactNode;
  className?: string;
};

type CellObj = { value: ReactNode; className?: string; slot?: CardSlot };
const alignCls = (a?: "left" | "right" | "center") => (a === "right" ? "text-right" : a === "center" ? "text-center" : undefined);
const hasValue = (v: FooterCell | undefined) => v !== undefined && v !== null && v !== false && v !== "";
const isCellObj = (v: FooterCell): v is CellObj =>
  typeof v === "object" && v !== null && !isValidElement(v) && !Array.isArray(v) && "value" in v;
function labelOf<T>(c: Column<T>) {
  return c.label ?? (typeof c.header === "string" ? c.header : c.key);
}

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
 * <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id}
 *   footerRows={[{ label: "Total", cells: { value: money(total) } }]} />
 *
 * @example Bill style totals, label right-aligned over the amount column
 * footerRows={[
 *   { label: "Subtotal", labelAlign: "right", className: "", cells: { amount: money(sub) } },
 *   { label: "Total", labelAlign: "right", cells: { amount: money(total) } },
 * ]}
 *
 * @example A grid read across (no phone cards), first column pinned
 * <ResponsiveTable cards={false} stickyFirst tall rows={groups} columns={[groupCol, ...sizeCols]} rowKey={(g) => g.key} />
 */
export function ResponsiveTable<T>({
  rows, columns, rowKey, rowClassName, rowId, footerRows, footer, caption, tall, flush, cards = true, stickyFirst, groupBy, groupHeader, className,
}: ResponsiveTableProps<T>) {
  const renderRow = (r: T, i: number) => (
    <tr key={rowKey(r, i)} id={rowId?.(r)} className={rowClassName?.(r, i) || undefined}>
      {columns.map((c) => (
        <Td
          key={c.key}
          data-slot={cards ? c.card ?? "field" : undefined}
          data-label={cards ? labelOf(c) : undefined}
          className={cx(alignCls(c.align), c.nowrap && "whitespace-nowrap", c.align === "right" && "tabular-nums", c.priority === 3 && "rt-p3", c.className)}
        >
          {c.cell(r, i)}
        </Td>
      ))}
    </tr>
  );

  let body: ReactNode;
  if (groupBy) {
    const groups: { key: string; items: { r: T; i: number }[] }[] = [];
    rows.forEach((r, i) => {
      const k = groupBy(r);
      const last = groups[groups.length - 1];
      if (last && last.key === k) last.items.push({ r, i });
      else groups.push({ key: k, items: [{ r, i }] });
    });
    body = groups.map((g) => (
      <Fragment key={`g:${g.key}`}>
        <tr className="rt-group">
          <th scope="colgroup" colSpan={columns.length} className="ui-td text-left">
            {groupHeader ? groupHeader(g.key, g.items.map((x) => x.r)) : g.key}
          </th>
        </tr>
        {g.items.map(({ r, i }) => renderRow(r, i))}
      </Fragment>
    ));
  } else {
    body = rows.map(renderRow);
  }

  const foot = footerRows?.length
    ? footerRows.map((fr, ri) => <FooterTr key={fr.key ?? ri} row={fr} columns={columns} cards={cards} />)
    : footer;

  return (
    <div className={cx("ui-table-wrap bg-surface", flush ? "rounded-none border-0" : "rounded-2xl border border-line shadow-sm", tall && "ui-table-tall", className)}>
      <table className={cx("ui-table", cards && "rt", stickyFirst && "rt-sticky-first")}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <Th key={c.key} className={cx(alignCls(c.align), c.priority === 3 && "rt-p3", c.headerClassName)}>{c.header}</Th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
    </div>
  );
}

function FooterTr<T>({ row, columns, cards }: { row: FooterRow; columns: Column<T>[]; cards: boolean }) {
  const valued = columns.map((c, i) => i > 0 && hasValue(row.cells[c.key]));
  const firstValue = valued.indexOf(true);
  const span = firstValue > 0 ? firstValue : 1;
  const valueCount = valued.filter(Boolean).length;
  const cells: ReactNode[] = [
    <Td key="__label" colSpan={span > 1 ? span : undefined} data-slot={cards ? "title" : undefined}
      className={cx(row.labelAlign === "right" && "sm:text-right", row.labelClassName)}>
      {row.label}
    </Td>,
  ];
  columns.forEach((c, i) => {
    if (i < span) return;
    const raw = row.cells[c.key];
    if (!valued[i]) {
      cells.push(<Td key={c.key} data-slot={cards ? "hidden" : undefined} className={cx(c.priority === 3 && "rt-p3")} />);
      return;
    }
    const obj = isCellObj(raw) ? raw : null;
    // A row with a single value reads "Label ..... value" on one line of the phone card.
    const slot: CardSlot = obj?.slot ?? (valueCount === 1 ? "badge" : c.card === "amount" ? "amount" : c.card === "hidden" ? "hidden" : "field");
    cells.push(
      <Td key={c.key} data-slot={cards ? slot : undefined} data-label={cards ? labelOf(c) : undefined}
        className={cx(alignCls(c.align ?? "right"), "whitespace-nowrap tabular-nums", c.priority === 3 && "rt-p3", obj?.className)}>
        {obj ? obj.value : (raw as ReactNode)}
      </Td>,
    );
  });
  return <tr className={row.className ?? "bg-muted font-semibold"}>{cells}</tr>;
}
