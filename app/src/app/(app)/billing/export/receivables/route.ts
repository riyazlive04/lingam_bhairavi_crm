import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { customerOutstanding, getCompany, openSalesInvoices } from "@/lib/billing";
import { todayIST } from "@/lib/format";
import { outstandingWorkbook } from "../xlsx";

export const dynamic = "force-dynamic";

/** GET /billing/export/receivables → .xlsx (customer ageing + open invoices). */
export async function GET() {
  const user = await requireUser("billing");
  const db = await getDb();
  const today = todayIST();
  const [parties, docs, company] = await Promise.all([customerOutstanding(db, today), openSalesInvoices(db, { today }), getCompany(db)]);
  await audit(db, user.id, "export", "receivables", null, { rows: docs.length });
  return outstandingWorkbook("Receivables", parties, docs, company.name);
}
