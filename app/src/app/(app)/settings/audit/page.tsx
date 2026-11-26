import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { Flash, Input, Select } from "@/components/ui";
import { ListEmpty, ListFilters, ResponsiveTable, StatusPill, type Column, type StatusSemantic } from "@/components/patterns";
import { SettingsTabs } from "../_components/settings-tabs";

export const metadata = { title: "Audit log" };

const ACTION_SEMANTIC: Record<string, StatusSemantic> = {
  create: "success", update: "info", delete: "danger", login: "neutral", post: "progress", email: "progress", approve: "success", reject: "danger", export: "neutral",
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

const label = (s: string) => { const t = s.replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; userId?: string; entityId?: string; ok?: string; err?: string }> }) {
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
  const activeCount = [sp.entity, Number(sp.userId) ? sp.userId : "", Number(sp.entityId) ? sp.entityId : ""].filter(Boolean).length;

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "record", header: "Record", card: "title", nowrap: true,
      cell: (r) => {
        const link = r.entityId != null ? ENTITY_LINK[r.entityType]?.(r.entityId) : undefined;
        return (
          <>
            {label(r.entityType)}
            {r.entityId != null && (link
              ? <> <a href={link} className="font-medium text-brand-700 hover:underline dark:text-brand-300">#{r.entityId}</a></>
              : ` #${r.entityId}`)}
          </>
        );
      },
    },
    { key: "action", header: "Action", card: "badge", cell: (r) => <StatusPill semantic={ACTION_SEMANTIC[r.action] ?? "neutral"} label={label(r.action)} /> },
    { key: "at", header: "When", card: "subtitle", nowrap: true, className: "text-ink-soft", cell: (r) => fmtDateTime(r.at) },
    { key: "user", header: "User", cell: (r) => r.userName ?? <span className="text-ink-faint">System</span> },
    {
      key: "details", header: "Details", className: "max-w-md whitespace-normal",
      cell: (r) => {
        const details = r.details == null ? "" : JSON.stringify(r.details);
        if (!details) return <span className="text-ink-faint">-</span>;
        if (details.length <= 120) return <code className="break-all text-caption text-ink-soft">{details}</code>;
        return (
          <details className="min-w-0">
            <summary className="cursor-pointer truncate rounded-md text-caption text-ink-soft hover:text-ink">{details.slice(0, 120)}…</summary>
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-surface-2 p-2 text-caption text-ink">{JSON.stringify(r.details, null, 2)}</pre>
          </details>
        );
      },
    },
  ];

  return (
    <>
      <SettingsTabs active="audit" />
      <div className="space-y-4">
        <Flash ok={sp.ok} err={sp.err} />
        <ListFilters searchName={false} clearHref="/settings/audit" activeCount={activeCount}>
          <Select name="entity" defaultValue={sp.entity ?? ""} aria-label="Record type">
            <option value="">All record types</option>
            {entities.map((e) => <option key={e.v} value={e.v}>{label(e.v)}</option>)}
          </Select>
          <Input name="entityId" type="number" min={1} inputMode="numeric" defaultValue={sp.entityId ?? ""} placeholder="Record number" aria-label="Record number" />
          <Select name="userId" defaultValue={sp.userId ?? ""} aria-label="User">
            <option value="">All users</option>
            {userList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </ListFilters>
        {rows.length === 0 ? (
          <ListEmpty filtered={activeCount > 0} noun="audit entries" clearHref="/settings/audit">
            Every create, update, approval and sign-in is recorded here.
          </ListEmpty>
        ) : (
          <div>
            <p className="mb-2 text-caption text-ink-soft">Latest {rows.length === 200 ? "200" : rows.length} entries. The audit trail cannot be edited.</p>
            <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Audit log" />
          </div>
        )}
      </div>
    </>
  );
}
