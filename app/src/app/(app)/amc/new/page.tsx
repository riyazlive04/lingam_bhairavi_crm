import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, projects, quotations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { AMC_SYSTEMS, BILLING_FREQUENCIES, COVERAGE, SCOPE_PARTS, defaultEndDate, toAmcSystem } from "@/lib/amc";
import { Flash } from "@/components/ui";
import { FormPage } from "@/components/patterns";
import { ContractForm, type ProjectOpt } from "../_components/contract-form";
import { amcAccess } from "../_lib/access";

export const metadata = { title: "New AMC contract" };

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ customerId?: string; projectId?: string; err?: string; ok?: string }> }) {
  const user = await requireUser("amc");
  if (!amcAccess(user.role).manage) redirect("/amc?err=" + encodeURIComponent("Only the owner or sales can create contracts"));
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();
  const [customerList, projectRows, engineerList] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, address: customers.address, city: customers.city })
      .from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name)),
    db.select({ id: projects.id, name: projects.name, code: projects.code, customerId: projects.customerId, siteAddress: projects.siteAddress, system: quotations.system })
      .from(projects).leftJoin(quotations, eq(quotations.id, projects.quotationId))
      .orderBy(asc(projects.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, "engineer"), eq(users.active, true))).orderBy(asc(users.name)),
  ]);
  const projectOpts: ProjectOpt[] = projectRows.map((r) => {
    const s = toAmcSystem(r.system);
    return { id: r.id, name: r.name, code: r.code, customerId: r.customerId, siteAddress: r.siteAddress, systems: s ? [s] : [] };
  });

  return (
    <FormPage
      title="New AMC contract"
      subtitle="Preventive visits are scheduled automatically and spread evenly over the contract term."
      back={{ href: "/amc", label: "AMC contracts" }}
      notices={<Flash ok={sp.ok} err={sp.err} />}
    >
      <ContractForm
        customers={customerList.map((c) => ({ id: c.id, name: c.name, address: [c.address, c.city].filter(Boolean).join(", ") || null }))}
        projects={projectOpts}
        engineers={engineerList}
        systems={AMC_SYSTEMS}
        frequencies={BILLING_FREQUENCIES}
        coverage={COVERAGE}
        scopeParts={SCOPE_PARTS}
        today={today}
        defaultEnd={defaultEndDate(today)}
        initialCustomerId={Number(sp.customerId) || undefined}
        initialProjectId={Number(sp.projectId) || undefined}
      />
    </FormPage>
  );
}
