import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Flash, PageHeader } from "@/components/ui";
import { VendorForm } from "../_components/vendor-form";
import { createVendor } from "../actions";

export default async function NewVendorPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("vendors");
  if (!canWrite(user.role, "vendors")) redirect("/forbidden");
  const sp = await searchParams;
  return (
    <div className="max-w-3xl">
      <PageHeader title="New vendor" back={{ href: "/vendors", label: "Vendors" }} />
      <Flash err={sp.err} />
      <VendorForm action={createVendor} cancelHref="/vendors" />
    </div>
  );
}
