import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canSeeCost, canWrite } from "@/lib/rbac";
import { Flash, PageHeader } from "@/components/ui";
import { ProjectForm } from "../_components/project-form";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ customerId?: string; quotationId?: string; err?: string }> }) {
  const user = await requireUser("projects");
  if (!canWrite(user.role, "projects")) redirect("/forbidden");
  const sp = await searchParams;
  const db = await getDb();
  return (
    <div className="max-w-3xl">
      <PageHeader title="New project" subtitle="A project is the cost centre for materials, purchases and site expenses." back={{ href: "/projects", label: "Projects" }} />
      <Flash err={sp.err} />
      <ProjectForm
        db={db}
        showFinancials={canSeeCost(user.role)}
        canAssign={user.role !== "engineer"}
        values={{
          status: "planning",
          customerId: Number(sp.customerId) || undefined,
          quotationId: Number(sp.quotationId) || undefined,
          engineerId: user.role === "engineer" ? user.id : undefined,
        }}
      />
    </div>
  );
}
