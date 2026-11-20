import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Flash, PageHeader } from "@/components/ui";
import { VendorForm } from "../../_components/vendor-form";
import { updateVendor } from "../../actions";

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
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${v.name}`} back={{ href: `/vendors/${v.id}`, label: v.name }} />
      <Flash err={sp.err} />
      <VendorForm action={updateVendor.bind(null, v.id)} vendor={v} cancelHref={`/vendors/${v.id}`} />
    </div>
  );
}
