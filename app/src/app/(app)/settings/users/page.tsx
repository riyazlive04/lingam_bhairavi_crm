import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, Field, Flash, Input, Select, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "../_components/password-input";
import { changeUserRole, createUser, resetPassword, setUserActive } from "../actions";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireUser("settings");
  const sp = await searchParams;
  const db = await getDb();
  const list = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, phone: users.phone, active: users.active, lastLoginAt: users.lastLoginAt })
    .from(users)
    .orderBy(asc(users.active), asc(users.name));
  list.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <Flash ok={sp.ok} err={sp.err} />

      <Table>
        <thead><tr><Th>User</Th><Th>Role</Th><Th>Status</Th><Th>Last sign-in</Th><Th>Password</Th></tr></thead>
        <tbody>
          {list.map((u) => {
            const self = u.id === me.id;
            return (
              <tr key={u.id} className={u.active ? undefined : "opacity-70"}>
                <Td>
                  <div className="font-medium">{u.name}{self && <span className="ml-1 text-xs text-ink-soft">(you)</span>}</div>
                  <div className="text-xs text-ink-soft">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
                </Td>
                <Td>
                  {self ? (
                    <Badge tone="violet">{ROLES[u.role as keyof typeof ROLES] ?? u.role}</Badge>
                  ) : (
                    <form action={changeUserRole} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <Select name="role" defaultValue={u.role} aria-label={`Role of ${u.name}`} className="h-8 w-40 py-1">
                        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                      <SubmitButton size="sm" variant="secondary" pendingText="…">Set</SubmitButton>
                    </form>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Badge tone={u.active ? "green" : "gray"}>{u.active ? "Active" : "Inactive"}</Badge>
                    {!self && (
                      <form action={setUserActive}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="active" value={u.active ? "0" : "1"} />
                        <SubmitButton size="sm" variant="ghost" pendingText="…" confirm={u.active ? `Deactivate ${u.name}? They will not be able to sign in.` : undefined}>
                          {u.active ? "Deactivate" : "Activate"}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-ink-soft">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}</Td>
                <Td>
                  <details>
                    <summary className="cursor-pointer text-sm text-brand-700 dark:text-brand-300">Reset</summary>
                    <form action={resetPassword} className="mt-2 flex w-72 flex-col gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <PasswordInput label={`New password for ${u.name}`} />
                      <SubmitButton size="sm" pendingText="Resetting…">Set new password</SubmitButton>
                    </form>
                  </details>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <form action={createUser}>
        <Card title="Add user">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required><Input name="name" required minLength={2} maxLength={120} autoComplete="off" /></Field>
            <Field label="Email (login)" required><Input name="email" type="email" required maxLength={160} autoComplete="off" /></Field>
            <Field label="Role" required>
              <Select name="role" defaultValue="engineer">
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Phone"><Input name="phone" type="tel" maxLength={20} /></Field>
            <Field label="Temporary password" required hint="Min 8 characters with letters and numbers. Share it privately; ask the user to keep it safe.">
              <PasswordInput />
            </Field>
          </div>
          <div className="mt-4"><SubmitButton>Add user</SubmitButton></div>
        </Card>
      </form>

      <Card title="What each role can do">
        <ul className="grid gap-2 text-sm text-ink-soft sm:grid-cols-2">
          <li><b className="text-ink">Owner / Admin</b>: everything, approves expenses, settings.</li>
          <li><b className="text-ink">Sales</b>: quotations, follow-ups, customers, refills, orders.</li>
          <li><b className="text-ink">Purchase</b>: purchase invoices, items & prices, vendors.</li>
          <li><b className="text-ink">Accounts</b>: billing, outstanding, approves expenses.</li>
          <li><b className="text-ink">Site Engineer</b>: own projects, expense vouchers, refills (no buying prices).</li>
          <li><b className="text-ink">Store</b>: stock, deliveries (no buying prices).</li>
        </ul>
      </Card>
    </div>
  );
}
