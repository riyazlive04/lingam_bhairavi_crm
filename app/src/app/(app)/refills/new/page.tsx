import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { EXTINGUISHER_TYPES } from "@/lib/constants";
import { todayIST } from "@/lib/format";
import { Flash } from "@/components/ui";
import { FormPage, Tabs } from "@/components/patterns";
import { AssetForm, INTERVAL_OPTIONS } from "../_components/asset-form";
import { BulkAdd } from "../_components/bulk-add";
import { bulkAddAssets } from "../actions";

export const metadata = { title: "Add extinguishers" };

export default async function NewAssetsPage({ searchParams }: { searchParams: Promise<{ customerId?: string; err?: string; mode?: string }> }) {
  const user = await requireUser("refills");
  if (!canWrite(user.role, "refills")) redirect("/forbidden");
  const sp = await searchParams;
  const db = await getDb();
  const customerList = await db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name));
  const today = todayIST();
  const pre = Number(sp.customerId) || undefined;
  const single = sp.mode === "single";
  const href = (mode?: string) => {
    const p = new URLSearchParams();
    if (pre) p.set("customerId", String(pre));
    if (mode) p.set("mode", mode);
    const s = p.toString();
    return s ? `/refills/new?${s}` : "/refills/new";
  };
  return (
    <FormPage title="Add extinguishers" subtitle="The next refill is due on the last refill (or install) date plus the interval."
      back={{ href: "/refills", label: "Refill tracker" }}
      notices={<><Flash err={sp.err} /><Tabs label="How to add" active={single ? "single" : "bulk"} items={[
        { id: "bulk", label: "Several at one site", href: href() },
        { id: "single", label: "One with a serial number", href: href("single") },
      ]} /></>}>
      {single
        ? <AssetForm customers={customerList} values={{ customerId: pre, qty: 1, refillIntervalMonths: 12 }} today={today} cancelHref="/refills" />
        : <BulkAdd action={bulkAddAssets} customers={customerList} types={EXTINGUISHER_TYPES} intervals={INTERVAL_OPTIONS} today={today} defaultCustomerId={pre} cancelHref="/refills" />}
    </FormPage>
  );
}
