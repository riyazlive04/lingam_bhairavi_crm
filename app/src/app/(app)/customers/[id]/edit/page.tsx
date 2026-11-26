import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Flash } from "@/components/ui";
import { FormPage } from "@/components/patterns";
import { CustomerForm } from "../../_components/customer-form";
import { updateCustomer } from "../../actions";

export default async function EditCustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("customers");
  if (!canWrite(user.role, "customers")) redirect("/forbidden");
  const { id } = await params;
  const sp = await searchParams;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) notFound();
  const db = await getDb();
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!c) notFound();
  return (
    <FormPage title={`Edit ${c.name}`} eyebrow="Customer" back={{ href: `/customers/${c.id}`, label: c.name }} notices={<Flash err={sp.err} />}>
      <CustomerForm action={updateCustomer.bind(null, c.id)} customer={c} cancelHref={`/customers/${c.id}`} />
    </FormPage>
  );
}
