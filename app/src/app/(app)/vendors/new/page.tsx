import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Flash } from "@/components/ui";
import { FormPage } from "@/components/patterns";
import { VendorForm } from "../_components/vendor-form";
import { createVendor } from "../actions";

export const metadata = { title: "New vendor" };

export default async function NewVendorPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("vendors");
  if (!canWrite(user.role, "vendors")) redirect("/forbidden");
  const sp = await searchParams;
  return (
    <FormPage width="narrow" title="New vendor" back={{ href: "/vendors", label: "Vendors" }}
      notices={sp.err ? <Flash err={sp.err} /> : undefined}>
      <VendorForm action={createVendor} cancelHref="/vendors" />
    </FormPage>
  );
}
