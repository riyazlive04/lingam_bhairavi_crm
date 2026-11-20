import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Flash, PageHeader } from "@/components/ui";
import { CustomerForm } from "../_components/customer-form";
import { createCustomer } from "../actions";

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("customers");
  if (!canWrite(user.role, "customers")) redirect("/forbidden");
  const sp = await searchParams;
  return (
    <div className="max-w-3xl">
      <PageHeader title="New customer" back={{ href: "/customers", label: "Customers" }} />
      <Flash err={sp.err} />
      <CustomerForm action={createCustomer} cancelHref="/customers" />
    </div>
  );
}
