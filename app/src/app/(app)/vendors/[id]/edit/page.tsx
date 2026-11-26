import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Flash } from "@/components/ui";
import { FormPage } from "@/components/patterns";
import { VendorForm } from "../../_components/vendor-form";
import { updateVendor } from "../../actions";

export const metadata = { title: "Edit vendor" };

export default async function EditVendorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("vendors");
  if (!canWrite(user.role, "vendors")) redirect("/forbidden");
  const { id } = await params;
  const sp = await searchParams;
  const vendorId = Number(id);
  if (!Number.isInteger(vendorId)) notFound();
  const db = await getDb();
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
  if (!v) notFound();
  return (
    <FormPage width="narrow" eyebrow="Vendor" title={`Edit ${v.name}`} back={{ href: `/vendors/${v.id}`, label: v.name }}
      notices={sp.err ? <Flash err={sp.err} /> : undefined}>
      <VendorForm action={updateVendor.bind(null, v.id)} vendor={v} cancelHref={`/vendors/${v.id}`} />
    </FormPage>
  );
}
