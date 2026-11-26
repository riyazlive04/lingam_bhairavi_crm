import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailOutbox } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { smtpConfigured } from "@/lib/email";
import { fmtDateTime } from "@/lib/format";
import { Mail, RotateCcw, Send } from "lucide-react";
import { Flash } from "@/components/ui";
import { Callout, DetailPage, KeyValueGrid, MetaChip, SectionCard, StatusPill } from "@/components/patterns";
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

  const related = linkOk && link
    ? <Link href={link} className="text-brand-700 hover:underline dark:text-brand-300">{m.entityType?.replace("_", " ")} #{m.entityId}</Link>
    : m.entityType ? `${m.entityType.replace("_", " ")} #${m.entityId ?? ""}` : null;

  return (
    <DetailPage
      back={{ href: "/emails", label: "Email outbox" }}
      eyebrow="E-mail"
      title={m.subject}
      status={<StatusPill status={m.status} />}
      meta={
        <>
          <MetaChip label="To">{m.to}</MetaChip>
          {m.agent && <MetaChip label="Source">{m.agent}</MetaChip>}
          <MetaChip label="Created">{fmtDateTime(m.createdAt)}</MetaChip>
        </>
      }
      primaryAction={canRetry && (
        <form action={retryEmails}>
          <input type="hidden" name="id" value={m.id} />
          <SubmitButton pendingText="Sending…">
            {m.status === "failed" ? <><RotateCcw className="icon-sm" aria-hidden /> Retry send</> : <><Send className="icon-sm" aria-hidden /> Send now</>}
          </SubmitButton>
        </form>
      )}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {m.error && <Callout tone="danger" title="This e-mail could not be sent">{m.error}</Callout>}
        </>
      }
      aside={
        <SectionCard title="Details">
          <KeyValueGrid columns={1} items={[
            { label: "To", value: <span className="break-all">{m.to}</span> },
            { label: "Cc", value: m.cc },
            { label: "Source", value: m.agent },
            { label: "Created", value: fmtDateTime(m.createdAt) },
            { label: "Sent", value: m.sentAt ? fmtDateTime(m.sentAt) : m.status === "logged" ? "Not sent (demo mode)" : null },
            { label: "Related", value: related },
          ]} />
        </SectionCard>
      }
    >
      <SectionCard title="Message preview" icon={Mail} description="Shown the way the recipient's mail app shows it." flush>
        {/*
          The body is HTML written for mail clients, which assume a white page. It is shown on a light
          "paper" (color-scheme light) set inside a muted frame, so in dark mode it reads as a document
          preview rather than a glaring hole. The iframe is sandboxed with no permissions: no scripts,
          no same-origin access, no forms, no top navigation.
        */}
        <div className="bg-muted p-2 sm:p-3">
          <iframe title={`E-mail body: ${m.subject}`} sandbox="" srcDoc={m.body} referrerPolicy="no-referrer"
            className="h-[70vh] w-full rounded-lg border border-line bg-white [color-scheme:light]" />
        </div>
      </SectionCard>
    </DetailPage>
  );
}
