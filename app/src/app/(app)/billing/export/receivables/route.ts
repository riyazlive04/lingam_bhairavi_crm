import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { customerAdvances, customerOutstanding, getCompany, openSalesInvoices, receiptNumber } from "@/lib/billing";
import { todayIST } from "@/lib/format";
import { openCreditNotes } from "@/lib/returns";
import { outstandingWorkbook } from "../xlsx";

export const dynamic = "force-dynamic";

/** GET /billing/export/receivables → .xlsx (customer ageing with credit notes, advances and net due, open invoices, open credits). */
export async function GET() {
  const user = await requireUser("billing");
  const db = await getDb();
  const today = todayIST();
  const [parties, docs, company, cns, advs] = await Promise.all([
    customerOutstanding(db, today), openSalesInvoices(db, { today }), getCompany(db), openCreditNotes(db), customerAdvances(db, { openOnly: true }),
  ]);
  const names = new Map(parties.map((p) => [p.partyId, p.name]));
  const credits = [
    ...cns.map((c) => ({ party: names.get(c.customerId) ?? "-", kind: "Credit note", number: c.number, date: c.date, total: c.total, used: c.adjustedAmount, balance: c.balance })),
    ...advs.map((a) => ({ party: a.customerName, kind: "Advance", number: a.reference || receiptNumber(a), date: a.date, total: a.amount, used: a.allocatedAmount, balance: a.balance })),
  ].sort((a, b) => a.party.localeCompare(b.party) || (a.date < b.date ? -1 : 1));
  await audit(db, user.id, "export", "receivables", null, { rows: docs.length, credits: credits.length });
  return outstandingWorkbook("Receivables", parties, docs, company.name, credits);
}
