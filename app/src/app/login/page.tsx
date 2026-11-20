import { redirect } from "next/navigation";
import { BellRing, ExternalLink, FileText, FireExtinguisher, ShieldCheck, Truck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { isDemoDatabase } from "@/db";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const DEMO = [
  ["admin@lbe.demo", "Owner / Admin"], ["sales@lbe.demo", "Sales"], ["purchase@lbe.demo", "Purchase"],
  ["accounts@lbe.demo", "Accounts"], ["engineer@lbe.demo", "Site Engineer"], ["store@lbe.demo", "Store"],
];

const VALUE_POINTS = [
  { icon: FileText, title: "Quotations in minutes", text: "Latest buying prices flow straight into every quote, with margins you can trust." },
  { icon: Truck, title: "Every PO line delivered", text: "Track customer orders, part deliveries and challans until the last item reaches site." },
  { icon: FireExtinguisher, title: "Refills never missed", text: "Extinguisher due dates and reminders handled for every customer." },
  { icon: BellRing, title: "A daily summary that works for you", text: "Rule-based agents flag follow-ups, overdue payments and stale prices each morning." },
];

function Flame({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.6 2.2c.3 2.6-.8 4.3-2.2 5.9-1.5 1.7-3.2 3.4-3.2 6.4A4.9 4.9 0 0 0 12 19.5a4.9 4.9 0 0 0 4.8-5c0-1.9-.8-3.3-1.6-4.5.1 1.4-.4 2.6-1.4 3 .5-3.7-.5-7.6-1.2-10.8Z" opacity=".95" />
      <path d="M12 21.8c-3.9 0-7-2.8-7-6.6 0-1.1.3-2.2.8-3.2-.1 3.3 2.8 6.2 6.2 6.2s6.3-2.9 6.2-6.2c.5 1 .8 2.1.8 3.2 0 3.8-3.1 6.6-7 6.6Z" opacity=".55" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string; next?: string }> }) {
  if (await getSession()) redirect("/");
  const sp = await searchParams;
  const showDemo = isDemoDatabase() || process.env.SHOW_DEMO_LOGINS === "1";
  const year = new Date().getFullYear();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-[#2a0c0a] text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-accent-500/25 blur-3xl" aria-hidden />
        <Flame className="pointer-events-none absolute -bottom-24 -right-16 h-[26rem] w-[26rem] text-white/[0.05]" />

        <div className="relative flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-inset ring-white/20 backdrop-blur"><Flame className="h-7 w-7" /></span>
          <div>
            <p className="font-display text-lg font-bold">Linga Bhairavi Enterprise</p>
            <p className="text-sm text-white/75">Fire safety systems · Hosur, Tamil Nadu</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h2 className="font-display text-4xl font-bold leading-tight tracking-tight xl:text-[2.75rem]">
            Run the whole fire-safety business from one place.
          </h2>
          <p className="mt-4 text-base text-white/80">Quotes, orders, purchases, site projects, refills and payments, all connected and always up to date.</p>
          <ul className="mt-10 grid gap-5">
            {VALUE_POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-inset ring-white/15"><Icon className="h-5 w-5" aria-hidden /></span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-white/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-xs text-white/70">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Role-based access. Every change is logged in the audit trail.
        </p>
      </aside>

      {/* Sign-in */}
      <main className="flex flex-col px-4 py-8 sm:px-8">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm"><Flame className="h-6 w-6" /></span>
            <div>
              <p className="font-display font-bold text-ink">Linga Bhairavi Enterprise</p>
              <p className="text-sm text-ink-soft">Fire Safety CRM · Hosur</p>
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">Welcome back</h1>
          <p className="mt-1.5 text-sm text-ink-soft">Sign in with your work email to continue.</p>

          <div className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-md sm:p-6">
            {sp.err && (
              <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{sp.err}</p>
            )}
            <form action="/api/auth/login" method="post" className="space-y-4">
              <input type="hidden" name="next" value={sp.next ?? "/"} />
              <Field label="Email"><Input name="email" type="email" autoComplete="username" required defaultValue={showDemo ? "admin@lbe.demo" : ""} placeholder="you@company.com" /></Field>
              <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required placeholder="Your password" /></Field>
              <SubmitButton className="w-full" size="lg" pendingText="Signing you in…">Sign in</SubmitButton>
            </form>
          </div>

          {showDemo && (
            <details className="group mt-4 rounded-2xl border border-line bg-surface text-sm shadow-xs" open>
              <summary className="cursor-pointer list-none rounded-2xl px-4 py-3 font-medium text-ink">
                Demo logins <span className="font-normal text-ink-soft">(password <code className="rounded bg-muted px-1 text-ink">Demo@123</code>)</span>
              </summary>
              <ul className="grid gap-1 border-t border-line px-4 py-3 text-ink-soft">
                {DEMO.map(([e, r]) => (
                  <li key={e} className="flex items-center justify-between gap-3">
                    <code className="truncate text-ink">{e}</code><span className="shrink-0 text-xs">{r}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <footer className="mx-auto mt-10 flex w-full max-w-sm flex-col items-center gap-1 text-center text-xs text-ink-soft sm:flex-row sm:justify-between">
          <span>© {year} Linga Bhairavi Enterprise</span>
          <a href="https://sirahdigital.in/" target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded hover:text-brand-700 dark:hover:text-brand-300">
            Built by <span className="font-semibold">Sirah Digital</span> <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </footer>
      </main>
    </div>
  );
}
