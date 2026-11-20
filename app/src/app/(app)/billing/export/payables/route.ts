import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getCompany, openPurchaseInvoices, vendorOutstanding } from "@/lib/billing";
import { todayIST } from "@/lib/format";
import { outstandingWorkbook } from "../xlsx";

export const dynamic = "force-dynamic";

/** GET /billing/export/payables → .xlsx (vendor ageing + unpaid posted purchase invoices). */
export async function GET() {
  const user = await requireUser("billing");
  const db = await getDb();
  const today = todayIST();
  const [parties, docs, company] = await Promise.all([vendorOutstanding(db, today), openPurchaseInvoices(db, { today }), getCompany(db)]);
  await audit(db, user.id, "export", "payables", null, { rows: docs.length });
  return outstandingWorkbook("Payables", parties, docs, company.name);
}
