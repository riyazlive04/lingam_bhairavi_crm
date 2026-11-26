/**
 * A4 document layout with the company letterhead, used by every printable document:
 * quotation, tax invoice, credit note, debit note, vendor PO, delivery challan, receipt,
 * AMC contract and visit report. Screen: a paper sheet on the page. Print: edge to edge,
 * black on white, header repeated on each page for long tables (see .doc-* in globals.css).
 * Server-safe. Maintainer: Sirah Digital.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { money } from "@/lib/format";
import { cx } from "../ui";
import { PrintButton } from "./print-button";

/** Shape of getCompany() from lib/billing (only the fields the letterhead needs). */
export type DocCompany = { name: string; address?: string | null; gstin?: string | null; pan?: string | null; phone?: string | null; email?: string | null; bank?: string | null; state?: string | null };
export type DocParty = { label: string; name: ReactNode; address?: string | null; city?: string | null; state?: string | null; gstin?: string | null; /** extra lines (contact, phone) */ extra?: ReactNode[] };

export type DocumentSheetProps = {
  company: DocCompany;
  /** Sentence case, printed large: "Tax invoice", "Credit note", "Purchase order". */
  title: string;
  numberLabel?: string;
  number: ReactNode;
  date?: ReactNode;
  /** More header facts on the right: [["Valid until", "30 Nov 2026"], ["Your PO", "4500123"]]. */
  meta?: [ReactNode, ReactNode][];
  /** Bill to / Issued to. */
  party?: DocParty;
  /** Second party block (Ship to, Site). */
  secondParty?: DocParty;
  /** Right column next to the party (place of supply, reason, tax type) as label/value pairs. */
  facts?: [ReactNode, ReactNode][];
  /** Diagonal watermark and banner: e.g. "Cancelled" or "Draft". */
  watermark?: string;
  /** Screen-only toolbar: back link and print button (plus any extra buttons). */
  toolbar?: { backHref: string; backLabel: string; actions?: ReactNode; printLabel?: string };
  children: ReactNode;
};

/**
 * @example
 * <DocumentSheet company={company} title="Credit note" numberLabel="Credit note no." number={r.number} date={fmtDate(r.date)}
 *   meta={[["Original invoice", inv]]} party={{ label: "Issued to", name: c.name, address: c.address, gstin: c.gstin }}
 *   facts={[["Place of supply", c.state], ["Tax", "CGST + SGST"]]}
 *   toolbar={{ backHref: `/returns/${r.id}`, backLabel: `Back to ${r.number}` }}>
 *   <DocTable>...</DocTable>
 *   <DocTotals ... />
 *   <DocSignature company={company.name} />
 * </DocumentSheet>
 */
export function DocumentSheet({ company, title, numberLabel = "No.", number, date, meta = [], party, secondParty, facts, watermark, toolbar, children }: DocumentSheetProps) {
  return (
    <>
      {toolbar && (
        <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
          <Link href={toolbar.backHref} className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-ink-soft hover:text-brand-700 dark:hover:text-brand-300">
            <ArrowLeft className="icon-sm" aria-hidden /> {toolbar.backLabel}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {toolbar.actions}
            <PrintButton label={toolbar.printLabel} />
          </div>
        </div>
      )}
      <article className="doc-sheet relative overflow-hidden">
        {watermark && (
          <>
            <p className="mb-3 rounded-md border border-danger-line bg-danger-soft py-1 text-center text-sm font-bold uppercase tracking-widest text-danger print:border-black print:bg-transparent print:text-black">{watermark}</p>
            <span aria-hidden className="pointer-events-none absolute inset-0 grid select-none place-items-center">
              <span className="-rotate-[30deg] font-display text-[5.5rem] font-extrabold uppercase tracking-widest text-ink opacity-[0.05]">{watermark}</span>
            </span>
          </>
        )}

        {/* Letterhead */}
        <header className="flex flex-col gap-4 border-b-2 border-brand-600 pb-4 print:border-black sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="doc-brand font-display text-[1.375rem] font-bold leading-tight text-brand-700 dark:text-brand-300">{company.name}</p>
            {company.address && <p className="mt-1 whitespace-pre-line text-[var(--doc-soft)]">{company.address}</p>}
            {(company.gstin || company.pan) && (
              <p className="mt-0.5">{company.gstin && <>GSTIN <strong>{company.gstin}</strong></>}{company.gstin && company.pan && " · "}{company.pan && <>PAN {company.pan}</>}</p>
            )}
            {(company.phone || company.email) && <p className="text-[var(--doc-soft)]">{[company.phone && `Phone ${company.phone}`, company.email].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="shrink-0 sm:text-right">
            <h1 className="font-display text-[1.25rem] font-bold uppercase tracking-wide">{title}</h1>
            <dl className="mt-1 space-y-0.5">
              <div className="flex gap-2 sm:justify-end"><dt className="text-[var(--doc-soft)]">{numberLabel}</dt><dd className="font-semibold">{number}</dd></div>
              {date && <div className="flex gap-2 sm:justify-end"><dt className="text-[var(--doc-soft)]">Date</dt><dd>{date}</dd></div>}
              {meta.map(([k, v], i) => <div key={i} className="flex gap-2 sm:justify-end"><dt className="text-[var(--doc-soft)]">{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </div>
        </header>

        {(party || secondParty || facts) && (
          <section className="doc-avoid-break grid gap-4 border-b border-[var(--doc-line)] py-4 sm:grid-cols-2">
            {party && <PartyBlock p={party} />}
            {secondParty && <PartyBlock p={secondParty} />}
            {facts && facts.length > 0 && (
              <dl className={cx("space-y-0.5", !secondParty && "sm:text-right")}>
                {facts.map(([k, v], i) => <div key={i} className={cx("flex gap-2", !secondParty && "sm:justify-end")}><dt className="text-[var(--doc-soft)]">{k}</dt><dd className="font-medium">{v}</dd></div>)}
              </dl>
            )}
          </section>
        )}

        <div className="space-y-4 pt-4">{children}</div>
      </article>
    </>
  );
}

function PartyBlock({ p }: { p: DocParty }) {
  const place = [p.city, p.state].filter(Boolean).join(", ");
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--doc-soft)]">{p.label}</p>
      <p className="mt-0.5 font-semibold">{p.name}</p>
      {p.address && <p className="whitespace-pre-line">{p.address}</p>}
      {place && <p>{place}</p>}
      {p.extra?.map((x, i) => <p key={i}>{x}</p>)}
      <p>GSTIN {p.gstin || "Unregistered"}</p>
    </div>
  );
}

/** Bordered document table (wraps sideways on small screens, repeats its header when printed). */
export function DocTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cx("doc-table min-w-max sm:min-w-0", className)}>{children}</table>
    </div>
  );
}

/**
 * GST rate-wise summary. Rows come from gstSummary() in lib/returns or equivalent.
 * @example <GstSummaryTable intra={intra} rows={gstSummary(lines, intra)} />
 */
export function GstSummaryTable({ rows, intra }: { rows: { rate: number; taxable: number; cgst: number; sgst: number; igst: number }[]; intra: boolean }) {
  return (
    <DocTable className="text-[0.75rem]">
      <thead>
        <tr>
          <th>GST rate</th><th className="num">Taxable</th>
          {intra ? <><th className="num">CGST</th><th className="num">SGST</th></> : <th className="num">IGST</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.rate}>
            <td>{r.rate}%</td><td className="num">{money(r.taxable)}</td>
            {intra ? <><td className="num">{money(r.cgst)}</td><td className="num">{money(r.sgst)}</td></> : <td className="num">{money(r.igst)}</td>}
          </tr>
        ))}
      </tbody>
    </DocTable>
  );
}

/**
 * Totals with GST split and amount in words, for documents.
 * @example <DocTotals taxable={sub} cgst={c} sgst={s} total={t} totalLabel="Credit note total" words={amountInWords(t)} />
 */
export function DocTotals({ rows = [], taxable, cgst, sgst, igst, total, totalLabel = "Total", words, note }: {
  rows?: [ReactNode, number][]; taxable?: number; cgst?: number; sgst?: number; igst?: number; total: number; totalLabel?: string; words?: ReactNode; note?: ReactNode;
}) {
  const line = (k: ReactNode, v: number, i: number | string) => (
    <div key={i} className="flex justify-between gap-4"><dt>{k}</dt><dd className="tabular-nums">{money(v)}</dd></div>
  );
  return (
    <div className="doc-avoid-break">
      <dl className="space-y-1">
        {rows.map(([k, v], i) => line(k, v, i))}
        {taxable != null && line("Taxable value", taxable, "tx")}
        {cgst != null && line("CGST", cgst, "c")}
        {sgst != null && line("SGST", sgst, "s")}
        {igst != null && line("IGST", igst, "i")}
        <div className="flex justify-between gap-4 border-t border-[var(--doc-line)] pt-1.5 text-[0.9375rem] font-bold">
          <dt>{totalLabel}</dt><dd className="tabular-nums">{money(total)}</dd>
        </div>
      </dl>
      {note && <p className="mt-1 text-[0.6875rem] text-[var(--doc-soft)]">{note}</p>}
      {words && <p className="mt-2 border-t border-[var(--doc-line)] pt-2"><span className="text-[var(--doc-soft)]">Amount in words: </span><strong>{words}</strong></p>}
    </div>
  );
}

/** Small print notes, terms and bank details under the totals. */
export function DocNotes({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="doc-avoid-break text-[0.75rem] text-[var(--doc-soft)]">
      {title && <p className="mb-0.5 font-semibold uppercase tracking-wider text-[var(--doc-ink)]">{title}</p>}
      <div className="space-y-1">{children}</div>
    </section>
  );
}

/**
 * Signature block. Left: the other party (optional), right: "For <company>" and the authorised signatory.
 * @example <DocSignature company={company.name} left="Received by (name and signature)" />
 */
export function DocSignature({ company, left, rightLabel = "Authorised signatory" }: { company: string; left?: ReactNode; rightLabel?: string }) {
  return (
    <footer className="doc-avoid-break mt-10 flex items-end justify-between gap-8 pt-4">
      <div className="min-w-0 flex-1">
        {left && (<><div className="h-12" /><p className="border-t border-[var(--doc-line)] pt-1">{left}</p></>)}
      </div>
      <div className="min-w-48 text-right">
        <p className="text-[0.75rem]">For <strong>{company}</strong></p>
        <div className="h-12" />
        <p className="border-t border-[var(--doc-line)] pt-1">{rightLabel}</p>
      </div>
    </footer>
  );
}
