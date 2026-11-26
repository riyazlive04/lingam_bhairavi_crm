import { asc } from "drizzle-orm";
import { KeyRound, UserPlus } from "lucide-react";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { Badge, Field, Flash, Input, Select } from "@/components/ui";
import { ConfirmButton, FormFooter, FormSection, ResponsiveTable, SectionCard, StatusPill, type Column } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "../_components/password-input";
import { SettingsTabs } from "../_components/settings-tabs";
import { changeUserRole, createUser, resetPassword, setUserActive } from "../actions";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireUser("settings");
  const sp = await searchParams;
  const db = await getDb();
  const list = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, phone: users.phone, active: users.active, lastLoginAt: users.lastLoginAt })
    .from(users)
    .orderBy(asc(users.active), asc(users.name));
  list.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const activeN = list.filter((u) => u.active).length;

  type U = (typeof list)[number];
  const columns: Column<U>[] = [
    {
      key: "user", header: "User", card: "title",
      cell: (u) => (
        <>
          <div className="font-medium text-ink">{u.name}{u.id === me.id && <span className="ml-1 text-caption font-normal text-ink-soft">(you)</span>}</div>
          <div className="text-caption font-normal text-ink-soft">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
        </>
      ),
    },
    { key: "status", header: "Status", card: "badge", cell: (u) => <StatusPill status={u.active ? "active" : "inactive"} /> },
    {
      key: "role", header: "Role",
      cell: (u) => u.id === me.id ? (
        <Badge tone="violet">{ROLES[u.role as keyof typeof ROLES] ?? u.role}</Badge>
      ) : (
        <form action={changeUserRole} className="flex w-full items-center gap-1.5 sm:w-auto">
          <input type="hidden" name="id" value={u.id} />
          <Select name="role" defaultValue={u.role} aria-label={`Role of ${u.name}`} className="min-w-0 flex-1 sm:w-40 sm:flex-none">
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <SubmitButton variant="secondary" pendingText="Saving…">Save role</SubmitButton>
        </form>
      ),
    },
    { key: "login", header: "Last sign-in", nowrap: true, className: "text-ink-soft", cell: (u) => (u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never") },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, label: "Actions", card: "actions",
      cell: (u) => (
        <div className="flex flex-col gap-2 sm:items-end">
          <details className="group w-full sm:w-auto">
            <summary className="inline-flex h-9.5 cursor-pointer select-none items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-brand-700 hover:bg-muted dark:text-brand-300">
              <KeyRound className="icon-sm" aria-hidden /> Reset password
            </summary>
            <form action={resetPassword} className="mt-2 flex w-full flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3 sm:w-80">
              <input type="hidden" name="id" value={u.id} />
              <PasswordInput label={`New password for ${u.name}`} />
              <SubmitButton pendingText="Saving…" className="w-full">Set new password</SubmitButton>
            </form>
          </details>
          {u.id !== me.id && (
            <form action={setUserActive}>
              <input type="hidden" name="id" value={u.id} />
              <input type="hidden" name="active" value={u.active ? "0" : "1"} />
              {u.active ? (
                <ConfirmButton variant="ghost" className="text-danger" confirmVariant="danger" stacked pendingText="Deactivating…"
                  confirm={`Deactivate ${u.name}? They will not be able to sign in.`} confirmLabel="Yes, deactivate">
                  Deactivate user
                </ConfirmButton>
              ) : (
                <SubmitButton variant="ghost" pendingText="Activating…">Activate user</SubmitButton>
              )}
            </form>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <SettingsTabs active="users" />
      <div className="space-y-8">
        <Flash ok={sp.ok} err={sp.err} />

        <SectionCard title="Users" count={list.length} description={`${activeN} active`} flush>
          <ResponsiveTable flush rows={list} columns={columns} rowKey={(u) => u.id} caption="Users" rowClassName={(u) => (!u.active ? "opacity-70" : undefined)} />
        </SectionCard>

        <form action={createUser} className="space-y-4">
          <FormSection title="Add user" description="They sign in with their email and the temporary password you set.">
            <Field label="Name" required><Input name="name" required minLength={2} maxLength={120} autoComplete="off" /></Field>
            <Field label="Email (used to sign in)" required><Input name="email" type="email" required maxLength={160} autoComplete="off" /></Field>
            <Field label="Role" required>
              <Select name="role" defaultValue="engineer" required>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Phone"><Input name="phone" type="tel" maxLength={20} /></Field>
            <Field label="Temporary password" required className="sm:col-span-2" hint="At least 8 characters with letters and numbers. Share it privately and ask the user to keep it safe.">
              <PasswordInput />
            </Field>
          </FormSection>
          <FormFooter>
            <SubmitButton pendingText="Adding…"><UserPlus className="icon-sm" aria-hidden /> Add user</SubmitButton>
          </FormFooter>
        </form>

        <SectionCard title="What each role can do">
          <ul className="grid gap-2 text-sm text-ink-soft sm:grid-cols-2">
            <li><b className="text-ink">Owner or admin</b>: everything, approves expenses, settings.</li>
            <li><b className="text-ink">Sales</b>: quotations, follow-ups, customers, refills, orders.</li>
            <li><b className="text-ink">Purchase</b>: purchase invoices, items and prices, vendors.</li>
            <li><b className="text-ink">Accounts</b>: billing, outstanding, approves expenses.</li>
            <li><b className="text-ink">Site engineer</b>: own projects, expense vouchers, refills (no buying prices).</li>
            <li><b className="text-ink">Store</b>: stock and deliveries (no buying prices).</li>
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
