import type { ReactNode } from "react";
import { fmtDate, money, qty, round2 } from "@/lib/format";
import { amountInWords, type Company } from "@/lib/billing";
import { gstSummary } from "@/lib/returns";

const td = "border border-line px-2 py-1.5";

export type NoteParty = { name: string; address?: string | null; city?: string | null; state?: string | null; gstin?: string | null };
export type NoteLine = { id: number; description: string; hsn: string | null; uom: string | null; qty: number; rate: number; gstRate: number; amount: number };

/** Printable GST credit note / debit note (same layout as the tax invoice). */
export function NotePrint({ title, company, party, partyLabel, numberLabel, number, date, refs, reason, lines, subtotal, taxAmount, total, intra, footerNote, cancelled }: {
  title: string; company: Company; party: NoteParty; partyLabel: string; numberLabel: string; number: string; date: string;
  refs: ReactNode[]; reason: string; lines: NoteLine[]; subtotal: number; taxAmount: number; total: number; intra: boolean; footerNote: string; cancelled?: boolean;
}) {
  const summary = gstSummary(lines, intra);
  const cgst = round2(summary.reduce((s, r) => s + r.cgst, 0));
  const sgst = round2(summary.reduce((s, r) => s + r.sgst, 0));
  return (
    <>
      {cancelled && <p className="mb-2 text-center text-lg font-bold uppercase text-red-600">Cancelled</p>}
      <article className="print-area mx-auto max-w-4xl rounded-xl border border-line bg-surface p-4 text-sm text-ink shadow-sm sm:p-8 print:max-w-none print:p-0">
        <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-brand-700 print:text-black">{company.name}</h1>
            <p className="whitespace-pre-line text-ink-soft">{company.address}</p>
            {company.gstin && <p>GSTIN: <strong>{company.gstin}</strong>{company.pan ? ` · PAN: ${company.pan}` : ""}</p>}
            <p className="text-ink-soft">{[company.phone && `Ph: ${company.phone}`, company.email].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-lg font-semibold uppercase tracking-wide">{title}</p>
            <p>{numberLabel}: <strong>{number}</strong></p>
            <p>Date: {fmtDate(date)}</p>
            {refs.map((r, i) => <p key={i}>{r}</p>)}
          </div>
        </header>

        <section className="grid gap-4 border-b border-line py-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{partyLabel}</p>
            <p className="font-semibold">{party.name}</p>
            <p className="whitespace-pre-line">{party.address || ""}{party.city ? `\n${party.city}` : ""}{party.state ? `, ${party.state}` : ""}</p>
            <p>GSTIN: {party.gstin || "Unregistered"}</p>
          </div>
          <div className="space-y-0.5 sm:text-right">
            <p>Place of supply: {party.state || company.state}</p>
            <p>Tax: {intra ? "CGST + SGST" : "IGST"}</p>
            <p>Reason: {reason}</p>
          </div>
        </section>

        <div className="overflow-x-auto py-4">
          <table className="w-full min-w-max border-collapse">
            <thead>
              <tr className="bg-muted print:bg-transparent">
                <th className={`${td} text-left`}>#</th><th className={`${td} text-left`}>Description</th><th className={`${td} text-left`}>HSN/SAC</th>
                <th className={`${td} text-right`}>Qty</th><th className={`${td} text-right`}>Rate</th><th className={`${td} text-right`}>Taxable value</th><th className={`${td} text-right`}>GST %</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.id}>
                  <td className={td}>{i + 1}</td>
                  <td className={`${td} whitespace-normal`}>{l.description}</td>
                  <td className={td}>{l.hsn || "-"}</td>
                  <td className={`${td} text-right tabular-nums`}>{qty(l.qty)} {l.uom ?? ""}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(l.rate)}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(l.amount)}</td>
                  <td className={`${td} text-right tabular-nums`}>{l.gstRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead><tr className="bg-muted print:bg-transparent">
                <th className={`${td} text-left`}>GST rate</th><th className={`${td} text-right`}>Taxable</th>
                {intra ? <><th className={`${td} text-right`}>CGST</th><th className={`${td} text-right`}>SGST</th></> : <th className={`${td} text-right`}>IGST</th>}
              </tr></thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.rate}>
                    <td className={td}>{r.rate}%</td><td className={`${td} text-right tabular-nums`}>{money(r.taxable)}</td>
                    {intra ? <><td className={`${td} text-right tabular-nums`}>{money(r.cgst)}</td><td className={`${td} text-right tabular-nums`}>{money(r.sgst)}</td></>
                      : <td className={`${td} text-right tabular-nums`}>{money(r.igst)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="space-y-1">
            <div className="flex justify-between"><dt>Taxable value</dt><dd className="tabular-nums">{money(subtotal)}</dd></div>
            {intra ? (
              <>
                <div className="flex justify-between"><dt>CGST</dt><dd className="tabular-nums">{money(cgst)}</dd></div>
                <div className="flex justify-between"><dt>SGST</dt><dd className="tabular-nums">{money(round2(taxAmount - cgst))}</dd></div>
              </>
            ) : <div className="flex justify-between"><dt>IGST</dt><dd className="tabular-nums">{money(taxAmount)}</dd></div>}
            {intra && Math.abs(round2(cgst + sgst) - round2(taxAmount)) > 0.01 && <div className="text-xs text-ink-faint">Rounded to the document total</div>}
            <div className="flex justify-between border-t border-line pt-1 text-base font-bold"><dt>{title} total</dt><dd className="tabular-nums">{money(total)}</dd></div>
          </dl>
        </section>
        <p className="mt-3 border-y border-line py-2"><span className="text-ink-soft">Amount in words:</span> <strong>{amountInWords(Number(total))}</strong></p>
        <p className="mt-3 text-xs text-ink-soft">{footerNote}</p>

        <footer className="mt-10 flex justify-end">
          <div className="text-right">
            <p className="text-xs">For {company.name}</p>
            <div className="h-12" />
            <p className="border-t border-line pt-1">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </>
  );
}
