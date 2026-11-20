/** Email templates used by the agents (plain HTML, inline styles for email clients). No AI. */
import { fmtDate, money } from "@/lib/format";
import type { CompanyInfo } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export type DunningInvoice = {
  number: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  outstanding: number;
  daysOverdue: number;
};

/** Consolidated payment reminder (one email per customer listing every overdue invoice). */
export function dunningEmail(opts: {
  customerName: string;
  contactPerson?: string | null;
  invoices: DunningInvoice[];
  company: CompanyInfo;
  reminderNo: number;
}): { subject: string; html: string } {
  const { company, invoices } = opts;
  const totalDue = invoices.reduce((s, i) => s + i.outstanding, 0);
  const oldest = Math.max(0, ...invoices.map((i) => i.daysOverdue));
  const firm = opts.reminderNo >= 3;
  const subject = `${firm ? "Final reminder" : "Payment reminder"}: ${money(totalDue)} outstanding | ${company.name}`;
  const rows = invoices
    .map(
      (i) => `<tr>
<td style="padding:6px 8px;border-bottom:1px solid #e3e6eb">${esc(i.number)}</td>
<td style="padding:6px 8px;border-bottom:1px solid #e3e6eb">${esc(fmtDate(i.invoiceDate))}</td>
<td style="padding:6px 8px;border-bottom:1px solid #e3e6eb">${esc(fmtDate(i.dueDate))}</td>
<td style="padding:6px 8px;border-bottom:1px solid #e3e6eb;text-align:right">${esc(money(i.total))}</td>
<td style="padding:6px 8px;border-bottom:1px solid #e3e6eb;text-align:right"><b>${esc(money(i.outstanding))}</b></td>
<td style="padding:6px 8px;border-bottom:1px solid #e3e6eb;text-align:right">${i.daysOverdue}</td>
</tr>`,
    )
    .join("");
  const greet = opts.contactPerson ? `Dear ${esc(opts.contactPerson)},` : `Dear Sir/Madam,`;
  const intro = firm
    ? `Despite our earlier reminders, the following invoice(s) from <b>${esc(company.name)}</b> remain unpaid, the oldest being ${oldest} days past due. We request you to kindly release the payment immediately.`
    : `This is a gentle reminder that the following invoice(s) from <b>${esc(company.name)}</b> are past their due date. We would be grateful if you could arrange the payment at the earliest.`;
  const contact = [company.phone && `Phone: ${esc(company.phone)}`, company.email && `Email: ${esc(company.email)}`].filter(Boolean).join(" · ");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#16191f;line-height:1.5">
<p>${greet}</p>
<p><b>${esc(opts.customerName)}</b></p>
<p>${intro}</p>
<table style="border-collapse:collapse;width:100%;max-width:680px;font-size:13px">
<thead><tr style="background:#f1f3f6">
<th style="padding:6px 8px;text-align:left">Invoice</th><th style="padding:6px 8px;text-align:left">Date</th><th style="padding:6px 8px;text-align:left">Due</th>
<th style="padding:6px 8px;text-align:right">Amount</th><th style="padding:6px 8px;text-align:right">Outstanding</th><th style="padding:6px 8px;text-align:right">Days overdue</th>
</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="4" style="padding:8px;text-align:right"><b>Total outstanding</b></td><td style="padding:8px;text-align:right"><b>${esc(money(totalDue))}</b></td><td></td></tr></tfoot>
</table>
${company.bank ? `<p style="margin-top:16px"><b>Bank details:</b><br>${esc(company.bank).replace(/\n/g, "<br>")}</p>` : ""}
<p>If the payment has already been made, please ignore this reminder and share the payment reference so we can update our records.</p>
<p>Thanking you,<br><b>${esc(company.name)}</b>${company.address ? `<br>${esc(company.address)}` : ""}${contact ? `<br>${contact}` : ""}</p>
<p style="color:#9aa3af;font-size:11px">This is an automated reminder (reminder #${opts.reminderNo}).</p>
</div>`;
  return { subject: subject.slice(0, 250), html };
}
