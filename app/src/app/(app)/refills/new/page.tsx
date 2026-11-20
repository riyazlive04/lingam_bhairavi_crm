import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { EXTINGUISHER_TYPES } from "@/lib/constants";
import { todayIST } from "@/lib/format";
import { Card, Flash, PageHeader } from "@/components/ui";
import { AssetForm, INTERVAL_OPTIONS } from "../_components/asset-form";
import { BulkAdd } from "../_components/bulk-add";
import { bulkAddAssets } from "../actions";

export default async function NewAssetsPage({ searchParams }: { searchParams: Promise<{ customerId?: string; err?: string; mode?: string }> }) {
  const user = await requireUser("refills");
  if (!canWrite(user.role, "refills")) redirect("/forbidden");
  const sp = await searchParams;
  const db = await getDb();
  const customerList = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name));
  const today = todayIST();
  const pre = Number(sp.customerId) || undefined;
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Add extinguishers" subtitle="Next refill due = last refill (or install) date + interval." back={{ href: "/refills", label: "Refill tracker" }} />
      <Flash err={sp.err} />
      <Card title="Bulk add (one customer site)">
        <BulkAdd action={bulkAddAssets} customers={customerList} types={EXTINGUISHER_TYPES} intervals={INTERVAL_OPTIONS} today={today} defaultCustomerId={pre} />
      </Card>
      <Card title="Single asset (with serial number)">
        <AssetForm customers={customerList} values={{ customerId: pre, qty: 1, refillIntervalMonths: 12 }} today={today} />
      </Card>
    </div>
  );
}
