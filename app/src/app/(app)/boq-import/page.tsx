import { asc, eq } from "drizzle-orm";
import { FileSpreadsheet } from "lucide-react";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { getPricingSettings } from "@/lib/pricing";
import { canSeeCost, canWrite } from "@/lib/rbac";
import { EmptyState, Flash, LinkButton, PageHeader } from "@/components/ui";
import { BoqImport } from "./_components/boq-import";
import { loadImportCatalog } from "./_lib/data";

export const metadata = { title: "Import consultant BOQ" };

type SP = { ok?: string; err?: string; customerId?: string };

export default async function BoqImportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("quotations");
  const sp = await searchParams;
  const header = (
    <PageHeader
      eyebrow="Quotations"
      title="Import consultant BOQ"
      subtitle="Upload the bill of quantities you received in Excel. We match each row to your items with the latest price and date, you check it, and a draft quotation is ready."
      back={{ href: "/quotations", label: "Quotations" }}
    />
  );

  if (!canWrite(user.role, "quotations")) {
    return (
      <div>
        {header}
        <EmptyState title="Only sales and admin can import a BOQ" icon={FileSpreadsheet} action={<LinkButton href="/quotations" variant="secondary">Back to quotations</LinkButton>}>
          You can view quotations, but creating one from a consultant BOQ needs quotation edit rights.
        </EmptyState>
      </div>
    );
  }

  const db = await getDb();
  const pricing = await getPricingSettings(db);
  const showCost = canSeeCost(user.role);
  const [custs, catalog] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, city: customers.city }).from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name)),
    loadImportCatalog(db, { withCost: showCost, markupPct: pricing.defaultMarkupPct }),
  ]);
  const wanted = Number(sp.customerId);
  const initialCustomerId = Number.isInteger(wanted) && custs.some((c) => c.id === wanted) ? wanted : null;

  return (
    <div>
      {header}
      <Flash ok={sp.ok} err={sp.err} />
      {custs.length === 0 ? (
        <EmptyState title="Add a customer first" icon={FileSpreadsheet} action={<LinkButton href="/customers">Go to customers</LinkButton>}>
          A quotation is always made out to a customer. Add the customer or consultant, then come back to import the BOQ.
        </EmptyState>
      ) : (
        <BoqImport
          customers={custs}
          catalog={catalog}
          showCost={showCost}
          defaultMarkup={pricing.defaultMarkupPct}
          gstPct={pricing.gstPct}
          today={todayIST()}
          canTemplate={canWrite(user.role, "boq")}
          initialCustomerId={initialCustomerId}
        />
      )}
    </div>
  );
}
