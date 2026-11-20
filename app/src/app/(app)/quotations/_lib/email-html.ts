/** HTML email body for a quotation (inline styles — email clients ignore stylesheets). */
import "server-only";
import type { customers, quotationLines, quotations } from "@/db/schema";
import { fmtDate, money, qty } from "@/lib/format";
import { computeQuoteTotals } from "@/lib/pricing";
import { groupBySection, numberToIndianWords, type CompanySettings } from "@/lib/quotations";

const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MAX_DESC = 160;
const short = (s: string) => (s.length > MAX_DESC ? s.slice(0, MAX_DESC - 1) + "…" : s);

export function quotationEmailHtml({ q, customer, lines, company, message, senderName }: {
  q: typeof quotations.$inferSelect;
  customer: typeof customers.$inferSelect | undefined;
  lines: (typeof quotationLines.$inferSelect)[];
  company: CompanySettings;
  message: string | null;
  senderName: string;
}): string {
  const live = lines.filter((l) => l.qty > 0);
  const t = computeQuoteTotals(live, q.discountPct, q.gstPct);
  const td = 'style="padding:6px 8px;border:1px solid #ddd;vertical-align:top"';
  const tdr = 'style="padding:6px 8px;border:1px solid #ddd;text-align:right;white-space:nowrap;vertical-align:top"';
  const rows = groupBySection(live).map((g) => {
    const head = g.section ? `<tr><td colspan="5" style="padding:6px 8px;border:1px solid #ddd;background:#f3f4f6;font-weight:bold">${esc(g.section)}</td></tr>` : "";
    return head + g.lines.map((l) => `<tr>
      <td ${td}>${esc(l.boqRef)}</td>
      <td ${td}>${esc(short(l.description))}</td>
      <td ${tdr}>${esc(qty(l.qty))} ${esc(l.uom)}</td>
      <td ${tdr}>${esc(money(l.qty * l.supplyRate))}</td>
      <td ${tdr}>${esc(money(l.qty * l.erectionRate))}</td>
    </tr>`).join("");
  }).join("");
  const totalRow = (label: string, value: string, bold = false) =>
    `<tr><td colspan="4" ${tdr}>${bold ? "<b>" : ""}${esc(label)}${bold ? "</b>" : ""}</td><td ${tdr}>${bold ? "<b>" : ""}${esc(value)}${bold ? "</b>" : ""}</td></tr>`;
  const greeting = customer?.contactPerson ? `Dear ${esc(customer.contactPerson)},` : "Dear Sir/Madam,";
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:760px">
  <p>${greeting}</p>
  <p>${message ? esc(message).replace(/\n/g, "<br>") : `Thank you for your enquiry. Please find below our quotation <b>${esc(q.number)}</b>${q.projectName ? ` for <b>${esc(q.projectName)}</b>` : ""}.`}</p>
  <table style="border-collapse:collapse;margin:12px 0;font-size:13px">
    <tr><td style="padding:2px 12px 2px 0;color:#555">Quotation No.</td><td><b>${esc(q.number)}</b></td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#555">Date</td><td>${esc(fmtDate(q.quoteDate))}</td></tr>
    ${q.validUntil ? `<tr><td style="padding:2px 12px 2px 0;color:#555">Valid until</td><td>${esc(fmtDate(q.validUntil))}</td></tr>` : ""}
    ${q.siteLocation ? `<tr><td style="padding:2px 12px 2px 0;color:#555">Site</td><td>${esc(q.siteLocation)}</td></tr>` : ""}
  </table>
  <table style="border-collapse:collapse;width:100%;font-size:12px">
    <thead><tr style="background:#b91c1c;color:#fff">
      <th ${td}>BOQ Ref</th><th ${td}>Description</th><th ${tdr}>Qty</th><th ${tdr}>Supply Amount</th><th ${tdr}>Erection Amount</th>
    </tr></thead>
    <tbody>${rows}
      ${totalRow("Supply total", money(t.supply))}
      ${totalRow("Erection total", money(t.erection))}
      ${t.discount ? totalRow(`Discount (${q.discountPct}%)`, "− " + money(t.discount)) : ""}
      ${totalRow(`GST (${q.gstPct}%)`, money(t.tax))}
      ${totalRow("Grand total", money(t.grand), true)}
    </tbody>
  </table>
  <p style="font-size:12px;color:#444"><i>${esc(numberToIndianWords(t.grand))}</i></p>
  ${q.terms || company.quoteTerms ? `<p style="font-size:12px"><b>Terms &amp; conditions</b><br>${esc(q.terms || company.quoteTerms).replace(/\n/g, "<br>")}</p>` : ""}
  <p>We look forward to your valued order. Please feel free to contact us for any clarification.</p>
  <p>Regards,<br>${esc(senderName)}<br><b>${esc(company.name)}</b><br>${esc(company.address)}${company.phone ? `<br>Ph: ${esc(company.phone)}` : ""}${company.email ? `<br>${esc(company.email)}` : ""}</p>
</div>`;
}
