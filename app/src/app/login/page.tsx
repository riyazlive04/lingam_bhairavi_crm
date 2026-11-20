import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Field, Flash, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { isDemoDatabase } from "@/db";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const DEMO = [
  ["admin@lbe.demo", "Owner / Admin"], ["sales@lbe.demo", "Sales"], ["purchase@lbe.demo", "Purchase"],
  ["accounts@lbe.demo", "Accounts"], ["engineer@lbe.demo", "Site Engineer"], ["store@lbe.demo", "Store"],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string; next?: string }> }) {
  if (await getSession()) redirect("/");
  const sp = await searchParams;
  const showDemo = isDemoDatabase() || process.env.SHOW_DEMO_LOGINS === "1";
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">LB</span>
          <div>
            <h1 className="text-lg font-semibold text-ink">Linga Bhairavi Enterprise</h1>
            <p className="text-sm text-ink-soft">Fire Safety CRM · Hosur</p>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <Flash err={sp.err} />
          <form action="/api/auth/login" method="post" className="space-y-4">
            <input type="hidden" name="next" value={sp.next ?? "/"} />
            <Field label="Email"><Input name="email" type="email" autoComplete="username" required defaultValue={showDemo ? "admin@lbe.demo" : ""} /></Field>
            <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
            <SubmitButton className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
          </form>
        </div>
        {showDemo && (
          <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm">
            <p className="font-medium text-ink">Demo logins (password <code className="rounded bg-muted px-1">Demo@123</code>)</p>
            <ul className="mt-2 space-y-1 text-ink-soft">
              {DEMO.map(([e, r]) => <li key={e}><code className="text-ink">{e}</code> — {r}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
