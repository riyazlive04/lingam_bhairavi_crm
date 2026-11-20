import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailOutbox } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { smtpConfigured } from "@/lib/email";
import { fmtDateTime } from "@/lib/format";
import { Card, DL, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { retryEmails } from "../actions";

export const metadata = { title: "E-mail" };

function entityLink(type: string | null, id: number | null): string | null {
  if (!type || !id) return null;
  if (type === "sales_invoice") return `/billing/invoices/${id}`;
  if (type === "customer") return `/billing/receivables/${id}`;
  if (type === "sales_order") return `/orders/${id}`;
  return null;
}

export default async function EmailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("emails");
  const { id } = await params;
  const sp = await searchParams;
  const emailId = Number(id);
  if (!Number.isInteger(emailId) || emailId <= 0) notFound();
  const db = await getDb();
  const [m] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, emailId));
  if (!m) notFound();
  const link = entityLink(m.entityType, m.entityId);
  const linkOk = link && (link.startsWith("/billing") ? canRead(user.role, "billing") : canRead(user.role, "orders"));
  const canRetry = canWrite(user.role, "emails") && smtpConfigured() && (m.status === "failed" || m.status === "logged");

  return (
    <>
      <PageHeader
        title={<span className="break-words">{m.subject}</span>}
        back={{ href: "/emails", label: "Email outbox" }}
        actions={canRetry && (
          <form action={retryEmails}>
            <input type="hidden" name="id" value={m.id} />
            <SubmitButton pendingText="Sending…">{m.status === "failed" ? "Retry send" : "Send now"}</SubmitButton>
          </form>
        )}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <Card className="mb-4">
        <DL items={[
          ["To", <span key="to" className="break-all">{m.to}</span>],
          ["Cc", m.cc || "-"],
          ["Status", <StatusBadge key="st" status={m.status} />],
          ["Source", m.agent ?? "-"],
          ["Created", fmtDateTime(m.createdAt)],
          ["Sent", m.sentAt ? fmtDateTime(m.sentAt) : m.status === "logged" ? "Not sent (demo mode)" : "-"],
          ["Related", linkOk && link ? <Link key="rel" href={link} className="text-brand-700 hover:underline dark:text-brand-300">{m.entityType?.replace("_", " ")} #{m.entityId}</Link> : m.entityType ? `${m.entityType} #${m.entityId ?? ""}` : "-"],
          ["Error", m.error ? <span key="err" className="text-red-600">{m.error}</span> : "-"],
        ]} />
      </Card>
      <Card title="Message preview" bodyClassName="p-0">
        {/* sandbox with no permissions: no scripts, no same-origin access, no forms, no top navigation */}
        <iframe title={`E-mail body: ${m.subject}`} sandbox="" srcDoc={m.body} referrerPolicy="no-referrer" className="h-[70vh] w-full rounded-b-xl bg-white" />
      </Card>
    </>
  );
}
