/**
 * Form layout: FormPage (header plus width), FormSection (titled block with a 2 column grid),
 * FormFooter (sticky Cancel / Save bar), LineItemsTable helpers for editable line grids and
 * MoneySummary for totals. Server-safe; usable inside "use client" editors too.
 * Maintainer: Sirah Digital.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { money } from "@/lib/format";
import { PageHeader, buttonClass, cx } from "../ui";

/**
 * @example
 * <FormPage title="New vendor" back={{ href: "/vendors", label: "Vendors" }}>
 *   <form action={createVendor} className="space-y-4">
 *     <FormSection title="Basic details" description="As printed on their invoice.">
 *       <Field label="Name" required><Input name="name" required /></Field>
 *       ...
 *     </FormSection>
 *     <FormFooter cancelHref="/vendors"><SubmitButton>Save vendor</SubmitButton></FormFooter>
 *   </form>
 * </FormPage>
 */
export function FormPage({ title, subtitle, eyebrow, back, notices, children, width = "default" }: {
  title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; back?: { href: string; label: string };
  notices?: ReactNode; children: ReactNode;
  /** narrow for short forms, default for most, wide for forms with a line grid. */
  width?: "narrow" | "default" | "wide";
}) {
  return (
    <div className={cx(width === "narrow" ? "max-w-2xl" : width === "default" ? "max-w-4xl" : "max-w-none")}>
      <PageHeader title={title} subtitle={subtitle} eyebrow={eyebrow} back={back} />
      {notices && <div className="mb-4 space-y-3">{notices}</div>}
      {children}
    </div>
  );
}

/**
 * Titled section. Children are laid out in a grid: 1 column on phones, `columns` from 640px.
 * Give a field `className="sm:col-span-2"` (or "sm:col-span-full") to span the row.
 */
export function FormSection({ title, description, children, columns = 2, aside, className }: {
  title: ReactNode; description?: ReactNode; children: ReactNode; columns?: 1 | 2 | 3; aside?: ReactNode; className?: string;
}) {
  return (
    <section className={cx("rounded-2xl border border-line bg-surface shadow-sm", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-subheading text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-caption text-ink-soft">{description}</p>}
        </div>
        {aside}
      </header>
      <div className={cx("grid gap-4 p-4 sm:p-5", columns >= 2 && "sm:grid-cols-2", columns === 3 && "lg:grid-cols-3")}>{children}</div>
    </section>
  );
}

/**
 * Footer for forms: note on the left, Cancel then the submit button on the right. Put it as the last child inside the <form>.
 * `sticky` (default true) keeps it above the phone tab bar while the form scrolls. Pass sticky={false} when the form
 * sits inside a DetailPage, whose own action bar already owns the bottom of the phone screen.
 * `stackOnMobile` stacks the buttons full width on phones (submit first) instead of sharing one row.
 * @example <FormFooter cancelHref="/vendors"><SubmitButton>Save vendor</SubmitButton></FormFooter>
 * @example <FormFooter sticky={false} cancelHref={base}><SubmitButton>Save asset</SubmitButton></FormFooter>
 */
export function FormFooter({ cancelHref, cancelLabel = "Cancel", note, children, className, sticky = true, stackOnMobile = false }: {
  cancelHref?: string; cancelLabel?: string; note?: ReactNode; children: ReactNode; className?: string;
  sticky?: boolean; stackOnMobile?: boolean;
}) {
  return (
    <div className={cx(
      "no-print mt-6 flex flex-col gap-2 border-line px-4 py-3",
      sticky
        ? "sticky bottom-nav-offset z-20 -mx-4 border-t bg-surface/95 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:shadow-md lg:bottom-4"
        : "rounded-2xl border bg-surface shadow-xs",
      "sm:flex-row sm:items-center sm:justify-between",
      className,
    )}>
      <div className="min-w-0 text-caption text-ink-soft">{note}</div>
      <div className={cx("flex gap-2", stackOnMobile ? "max-sm:flex-col-reverse max-sm:items-stretch sm:items-center max-sm:[&>*]:w-full" : "items-center max-sm:[&>*]:flex-1")}>
        {cancelHref && <Link href={cancelHref} className={buttonClass("ghost")}>{cancelLabel}</Link>}
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- line items

/** Class names for editable line grids (see .li-* in globals.css). */
export const li = {
  wrap: "li-wrap",
  table: "li-table",
  num: "li-num",
  input: "li-input",
  numInput: "li-input li-num",
} as const;

/**
 * Wrapper for an editable line grid. Children are <thead>, <tbody>, <tfoot>.
 * Use `li.input` / `li.numInput` on cell inputs so the grid reads like a sheet.
 * @example
 * <LineItemsTable minWidth={960} caption="Quotation lines">
 *   <thead><tr><th>#</th><th>Item</th><th className={li.num}>Qty</th></tr></thead>
 *   <tbody><tr><td>1</td><td>...</td><td><input className={li.numInput} inputMode="decimal" /></td></tr></tbody>
 * </LineItemsTable>
 */
export function LineItemsTable({ children, minWidth, caption, className }: { children: ReactNode; minWidth?: number; caption?: string; className?: string }) {
  return (
    <div className={cx("li-wrap", className)}>
      <table className="li-table" style={minWidth ? { minWidth } : undefined}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- money summary

export type MoneyRow = { label: ReactNode; value: number; hint?: ReactNode; /** show as a deduction (minus sign, muted) */ minus?: boolean };

/**
 * Totals block for quotations, invoices, notes and POs. Pass only the rows that apply.
 * GST: give `cgst` and `sgst` for intra-state, `igst` for inter-state, or `tax` when there is no split.
 * @example
 * <MoneySummary subtotal={t.subtotal} discount={t.discount} cgst={c} sgst={s} total={t.grand}
 *   totalLabel="Grand total" words={amountInWords(t.grand)} />
 */
export function MoneySummary({ rows, subtotal, subtotalLabel = "Subtotal", discount, taxable, cgst, sgst, igst, tax, taxLabel = "GST", roundOff,
  total, totalLabel = "Total", words, className, note }: {
  rows?: MoneyRow[]; subtotal?: number; subtotalLabel?: string; discount?: number; taxable?: number; cgst?: number; sgst?: number; igst?: number;
  tax?: number; taxLabel?: string; roundOff?: number; total: number; totalLabel?: string; words?: ReactNode; className?: string; note?: ReactNode;
}) {
  const list: MoneyRow[] = [];
  if (subtotal != null) list.push({ label: subtotalLabel, value: subtotal });
  if (rows) list.push(...rows);
  if (discount) list.push({ label: "Discount", value: discount, minus: true });
  if (taxable != null) list.push({ label: "Taxable value", value: taxable });
  if (cgst != null) list.push({ label: "CGST", value: cgst });
  if (sgst != null) list.push({ label: "SGST", value: sgst });
  if (igst != null) list.push({ label: "IGST", value: igst });
  if (tax != null) list.push({ label: taxLabel, value: tax });
  if (roundOff) list.push({ label: "Round off", value: roundOff });
  return (
    <div className={cx("min-w-0", className)}>
      <dl className="space-y-1.5 text-sm">
        {list.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-soft">{r.label}{r.hint && <span className="ml-1 text-caption text-ink-faint">{r.hint}</span>}</dt>
            <dd className={cx("tabular-nums", r.minus ? "text-ink-soft" : "text-ink")}>{r.minus ? `- ${money(r.value)}` : money(r.value)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
          <dt className="font-semibold text-ink">{totalLabel}</dt>
          <dd className="font-display text-heading font-bold tabular-nums text-ink">{money(total)}</dd>
        </div>
      </dl>
      {words && <p className="mt-2 text-caption text-ink-soft"><span className="text-ink-faint">In words: </span><span className="font-medium text-ink">{words}</span></p>}
      {note && <p className="mt-2 text-caption text-ink-faint">{note}</p>}
    </div>
  );
}
