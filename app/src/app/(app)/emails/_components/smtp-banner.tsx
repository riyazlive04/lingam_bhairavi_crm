import { Info, Send } from "lucide-react";

/** Explains whether e-mails are really sent (SMTP configured) or only logged (demo). */
export function SmtpBanner({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        <Send className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>Live mode: e-mails are delivered through the configured SMTP server (Office 365).</span>
      </div>
    );
  }
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p><strong>Demo mode: e-mails are logged here, not sent.</strong> To send through Office 365, set these environment variables and restart:</p>
        <code className="mt-1 block overflow-x-auto whitespace-pre rounded bg-amber-100/70 px-2 py-1 text-xs dark:bg-amber-900/40">
          {"SMTP_HOST=smtp.office365.com\nSMTP_PORT=587\nSMTP_USER=accounts@yourdomain.com\nSMTP_PASS=********\nSMTP_FROM=\"Linga Bhairavi Enterprise <accounts@yourdomain.com>\""}
        </code>
        <p className="mt-1 text-xs">The mailbox must have “Authenticated SMTP” enabled in Microsoft 365 admin.</p>
      </div>
    </div>
  );
}
