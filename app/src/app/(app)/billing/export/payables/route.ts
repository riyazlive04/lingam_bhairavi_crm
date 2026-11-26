import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getCompany, openPurchaseInvoices, vendorOutstanding } from "@/lib/billing";
import { todayIST } from "@/lib/format";
import { openDebitNotes } from "@/lib/returns";
import { outstandingWorkbook } from "../xlsx";

export const dynamic = "force-dynamic";

/** GET /billing/export/payables → .xlsx (vendor ageing with debit notes and net due, unpaid posted bills, open debit notes). */
export async function GET() {
  const user = await requireUser("billing");
  const db = await getDb();
  const today = todayIST();
  const [parties, docs, company, dns] = await Promise.all([vendorOutstanding(db, today), openPurchaseInvoices(db, { today }), getCompany(db), openDebitNotes(db)]);
  const names = new Map(parties.map((p) => [p.partyId, p.name]));
  const credits = dns.map((d) => ({ party: names.get(d.vendorId) ?? "-", kind: "Debit note", number: d.number, date: d.date, total: d.total, used: d.adjustedAmount, balance: d.balance }));
  await audit(db, user.id, "export", "payables", null, { rows: docs.length, debitNotes: dns.length });
  return outstandingWorkbook("Payables", parties, docs, company.name, credits);
}
