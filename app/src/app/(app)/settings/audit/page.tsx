import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { Badge, Button, EmptyState, Input, Select, Table, Td, Th, type Tone } from "@/components/ui";

const ACTION_TONE: Record<string, Tone> = {
  create: "green", update: "blue", delete: "red", login: "gray", post: "violet", email: "violet", approve: "green", reject: "red", export: "gray",
};

const ENTITY_LINK: Record<string, (id: number) => string> = {
  project: (id) => `/projects/${id}`,
  expense: (id) => `/expenses/${id}`,
  extinguisher_asset: (id) => `/refills/${id}`,
  refill_service: (id) => `/refills/${id}`,
  meeting_note: (id) => `/meeting-notes/${id}`,
  quotation: (id) => `/quotations/${id}`,
  sales_order: (id) => `/orders/${id}`,
  purchase_invoice: (id) => `/purchases/${id}`,
  customer: (id) => `/customers/${id}`,
  vendor: (id) => `/vendors/${id}`,
  item: (id) => `/items/${id}`,
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; userId?: string; entityId?: string }> }) {
  await requireUser("settings");
  const sp = await searchParams;
  const db = await getDb();
  const conds: SQL[] = [];
  if (sp.entity) conds.push(eq(auditLog.entityType, sp.entity));
  if (Number(sp.userId)) conds.push(eq(auditLog.userId, Number(sp.userId)));
  if (Number(sp.entityId)) conds.push(eq(auditLog.entityId, Number(sp.entityId)));

  const [rows, entities, userList] = await Promise.all([
    db
      .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, entityType: auditLog.entityType, entityId: auditLog.entityId, details: auditLog.details, userName: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(200),
    db.selectDistinct({ v: auditLog.entityType }).from(auditLog).orderBy(asc(auditLog.entityType)),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)),
  ]);

  return (
    <div>
      <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select name="entity" defaultValue={sp.entity ?? ""} aria-label="Entity type" className="sm:w-48">
          <option value="">All entities</option>
          {entities.map((e) => <option key={e.v} value={e.v}>{e.v.replace(/_/g, " ")}</option>)}
        </Select>
        <Input name="entityId" type="number" min={1} defaultValue={sp.entityId ?? ""} placeholder="Record #" aria-label="Record id" className="sm:w-28" />
        <Select name="userId" defaultValue={sp.userId ?? ""} aria-label="User" className="col-span-2 sm:w-44">
          <option value="">All users</option>
          {userList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <p className="mb-3 text-xs text-ink-soft">Latest 200 entries. The audit trail is append-only.</p>
      {rows.length === 0 ? (
        <EmptyState title="No audit entries" />
      ) : (
        <Table>
          <thead><tr><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Record</Th><Th>Details</Th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const link = r.entityId != null ? ENTITY_LINK[r.entityType]?.(r.entityId) : undefined;
              const details = r.details == null ? "" : JSON.stringify(r.details);
              return (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-ink-soft">{fmtDateTime(r.at)}</Td>
                  <Td>{r.userName ?? <span className="text-ink-faint">system</span>}</Td>
                  <Td><Badge tone={ACTION_TONE[r.action] ?? "gray"}>{r.action}</Badge></Td>
                  <Td className="whitespace-nowrap">
                    {r.entityType.replace(/_/g, " ")}
                    {r.entityId != null && (link ? <> <a href={link} className="text-brand-700 hover:underline dark:text-brand-300">#{r.entityId}</a></> : ` #${r.entityId}`)}
                  </Td>
                  <Td className="max-w-md">
                    {details ? (
                      details.length > 120 ? (
                        <details>
                          <summary className="cursor-pointer truncate text-xs text-ink-soft">{details.slice(0, 120)}…</summary>
                          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs text-ink">{JSON.stringify(r.details, null, 2)}</pre>
                        </details>
                      ) : <code className="break-all text-xs text-ink-soft">{details}</code>
                    ) : <span className="text-ink-faint">—</span>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
