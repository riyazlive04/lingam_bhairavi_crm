import { Send } from "lucide-react";
import { Callout } from "@/components/patterns";

/** Explains whether e-mails are really sent (SMTP configured) or only logged (demo). */
export function SmtpBanner({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <Callout tone="success" icon={Send} title="Live mode">
        E-mails are delivered through the configured SMTP server (Office 365).
      </Callout>
    );
  }
  return (
    <Callout tone="warning" title="Demo mode: e-mails are logged here, not sent">
      <p>To send through Office 365, set these environment variables and restart:</p>
      <code className="mt-1 block overflow-x-auto whitespace-pre rounded-lg border border-line bg-surface px-2 py-1 text-caption text-ink">
        {"SMTP_HOST=smtp.office365.com\nSMTP_PORT=587\nSMTP_USER=accounts@yourdomain.com\nSMTP_PASS=********\nSMTP_FROM=\"Linga Bhairavi Enterprise <accounts@yourdomain.com>\""}
      </code>
      <p className="mt-1 text-caption">The mailbox must have Authenticated SMTP turned on in the Microsoft 365 admin centre.</p>
    </Callout>
  );
}
