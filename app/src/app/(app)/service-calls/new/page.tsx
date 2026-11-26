import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { amcContracts, customers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { todayIST } from "@/lib/format";
import { CALL_PRIORITIES } from "@/lib/amc";
import { SYSTEMS } from "@/lib/constants";
import { EmptyState, Flash, LinkButton } from "@/components/ui";
import { FormPage } from "@/components/patterns";
import { CallForm } from "../_components/call-form";
import { amcAccess } from "../../amc/_lib/access";

export const metadata = { title: "New service call" };

export default async function NewCallPage({ searchParams }: { searchParams: Promise<{ customerId?: string; contractId?: string; err?: string; ok?: string }> }) {
  const user = await requireUser("amc");
  const sp = await searchParams;
  if (!canWrite(user.role, "amc")) {
    return <EmptyState title="You can view service calls but not log them" action={<LinkButton href="/service-calls">Back to service calls</LinkButton>} />;
  }
  const db = await getDb();
  const today = todayIST();
  const acc = amcAccess(user.role);
  const [customerList, contracts, engineerList] = await Promise.all([
    db.select({ id: customers.id, name: customers.name }).from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name)),
    db.select({ id: amcContracts.id, customerId: amcContracts.customerId, number: amcContracts.number, responseHours: amcContracts.responseHours, systems: amcContracts.systems })
      .from(amcContracts)
      .where(and(eq(amcContracts.status, "active"), lte(amcContracts.startDate, today), gte(amcContracts.endDate, today)))
      .orderBy(asc(amcContracts.endDate)),
    acc.manage ? db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, "engineer"), eq(users.active, true))).orderBy(asc(users.name)) : Promise.resolve([]),
  ]);
  const systems = Object.fromEntries(Object.entries(SYSTEMS).filter(([k]) => k !== "spares"));

  return (
    <FormPage title="Log a service call" width="narrow"
      subtitle="Breakdown or complaint from a customer. The response deadline is set from their AMC, or 48 hours without one."
      back={{ href: "/service-calls", label: "Service calls" }} notices={<Flash ok={sp.ok} err={sp.err} />}>
      <CallForm
        customers={customerList}
        contracts={contracts.map((c) => ({ ...c, systems: c.systems ?? [] }))}
        engineers={engineerList}
        systems={systems}
        priorities={CALL_PRIORITIES}
        canAssign={acc.manage}
        selfId={user.role === "engineer" ? user.id : null}
        initialCustomerId={Number(sp.customerId) || undefined}
        initialContractId={Number(sp.contractId) || undefined}
      />
    </FormPage>
  );
}
