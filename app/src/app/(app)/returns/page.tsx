import Link from "next/link";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { Plus, Undo2 } from "lucide-react";
import { getDb } from "@/db";
import { customers, purchaseInvoices, purchaseReturns, salesInvoices, salesOrders, salesReturns, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { fmtDate, money, moneyShort, round2 } from "@/lib/format";
import { noteBalance, reasonLabel } from "@/lib/returns";
import { Badge, Button, EmptyState, Flash, Input, LinkButton, PageHeader, Select, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";

export const metadata = { title: "Returns" };

type SP = { tab?: string; q?: string; status?: string; ok?: string; err?: string };
const STATUSES = ["draft", "posted"] as const;

function Tabs({ active }: { active: "customer" | "vendor" }) {
  const tabs = [
    { key: "customer", href: "/returns", label: "Customer returns" },
    { key: "vendor", href: "/returns?tab=vendor", label: "Returns to vendor" },
  ] as const;
  return (
    <nav aria-label="Return types" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link href={t.href} aria-current={t.key === active ? "page" : undefined}
              className={cx("-mb-px inline-block border-b-2 px-3 py-2 text-sm font-medium",
                t.key === active ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-ink-soft hover:border-line hover:text-ink")}>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Filters({ tab, q, status }: { tab: string; q?: string; status?: string }) {
  return (
    <form method="get" role="search" className="mb-4 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-xs sm:flex-row sm:items-center">
      {tab === "vendor" && <input type="hidden" name="tab" value="vendor" />}
      <label className="min-w-0 sm:max-w-xs sm:flex-1">
        <span className="sr-only">Search</span>
        <Input name="q" type="search" defaultValue={q} placeholder={tab === "vendor" ? "Debit note, vendor or bill no." : "Credit note, customer or invoice"} />
      </label>
      <label className="sm:w-44">
        <span className="sr-only">Status</span>
        <Select name="status" defaultValue={status ?? ""}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s === "draft" ? "Draft" : "Posted"}</option>)}
        </Select>
      </label>
      <Button variant="secondary" type="submit">Apply</Button>
    </form>
  );
}

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("returns");
  const sp = await searchParams;
  const tab = sp.tab === "vendor" ? "vendor" : "customer";
  const q = sp.q?.trim().slice(0, 80);
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const write = canWrite(user.role, "returns");
  const db = await getDb();

  if (tab === "vendor") {
    const where: SQL[] = [];
    if (status) where.push(eq(purchaseReturns.status, status));
    if (q) { const c = or(ilike(purchaseReturns.number, `%${q}%`), ilike(vendors.name, `%${q}%`), ilike(purchaseInvoices.invoiceNo, `%${q}%`)); if (c) where.push(c); }
    const rows = await db
      .select({ r: purchaseReturns, vendorName: vendors.name, billNo: purchaseInvoices.invoiceNo })
      .from(purchaseReturns)
      .leftJoin(vendors, eq(vendors.id, purchaseReturns.vendorId))
      .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, purchaseReturns.purchaseInvoiceId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(purchaseReturns.date), desc(purchaseReturns.id))
      .limit(300);
    const posted = rows.filter((x) => x.r.status === "posted");
    const unadjusted = round2(posted.reduce((s, x) => s + noteBalance(x.r.total, x.r.adjustedAmount), 0));
    return (
      <>
        <PageHeader title="Returns" subtitle="Goods coming back from customers and goods going back to vendors"
          actions={write && <LinkButton href="/returns/vendor/new"><Plus className="h-4 w-4" aria-hidden /> Return to vendor</LinkButton>} />
        <Flash ok={sp.ok} err={sp.err} />
        <Tabs active="vendor" />
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Debit notes posted" value={posted.length} hint={moneyShort(posted.reduce((s, x) => s + Number(x.r.total), 0))} />
          <Stat label="Not yet adjusted" value={moneyShort(unadjusted)} tone={unadjusted > 0 ? "warn" : "default"} hint="reduces what we owe the vendor" />
          <Stat label="Drafts" value={rows.length - posted.length} hint="not posted yet" />
        </div>
        <Filters tab="vendor" q={q} status={status} />
        {rows.length === 0 ? (
          <EmptyState icon={Undo2} title={q || status ? "No debit notes match these filters" : "No returns to vendors yet"}
            action={write && !q && !status ? <LinkButton href="/returns/vendor/new"><Plus className="h-4 w-4" aria-hidden /> Return to vendor</LinkButton> : undefined}>
            Send faulty or excess material back to the supplier against their bill. Posting takes it out of stock and reduces what you owe.
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Debit note</Th><Th>Date</Th><Th>Vendor</Th><Th>Bill</Th><Th className="text-right">Total</Th><Th className="text-right">Adjusted</Th><Th className="text-right">Balance</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.map(({ r, vendorName, billNo }) => (
                <tr key={r.id}>
                  <Td><Link href={`/returns/vendor/${r.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.status === "draft" ? "Draft" : r.number}</Link></Td>
                  <Td className="whitespace-nowrap">{fmtDate(r.date)}</Td>
                  <Td className="max-w-56 truncate">{vendorName ?? "-"}</Td>
                  <Td>{billNo ?? "-"}</Td>
                  <Td className="text-right tabular-nums">{money(r.total)}</Td>
                  <Td className="text-right tabular-nums">{r.status === "posted" ? money(r.adjustedAmount) : "-"}</Td>
                  <Td className="text-right font-medium tabular-nums">{r.status === "posted" ? money(noteBalance(r.total, r.adjustedAmount)) : "-"}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </>
    );
  }

  const where: SQL[] = [];
  if (status) where.push(eq(salesReturns.status, status));
  if (q) { const c = or(ilike(salesReturns.number, `%${q}%`), ilike(customers.name, `%${q}%`), ilike(salesInvoices.number, `%${q}%`), ilike(salesOrders.number, `%${q}%`)); if (c) where.push(c); }
  const rows = await db
    .select({ r: salesReturns, customerName: customers.name, invNo: salesInvoices.number, orderNo: salesOrders.number })
    .from(salesReturns)
    .leftJoin(customers, eq(customers.id, salesReturns.customerId))
    .leftJoin(salesInvoices, eq(salesInvoices.id, salesReturns.salesInvoiceId))
    .leftJoin(salesOrders, eq(salesOrders.id, salesReturns.orderId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(salesReturns.date), desc(salesReturns.id))
    .limit(300);
  const posted = rows.filter((x) => x.r.status === "posted");
  const unadjusted = round2(posted.reduce((s, x) => s + noteBalance(x.r.total, x.r.adjustedAmount), 0));

  return (
    <>
      <PageHeader title="Returns" subtitle="Goods coming back from customers and goods going back to vendors"
        actions={write && <LinkButton href="/returns/new"><Plus className="h-4 w-4" aria-hidden /> Customer return</LinkButton>} />
      <Flash ok={sp.ok} err={sp.err} />
      <Tabs active="customer" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Credit notes posted" value={posted.length} hint={moneyShort(posted.reduce((s, x) => s + Number(x.r.total), 0))} />
        <Stat label="Not yet adjusted" value={moneyShort(unadjusted)} tone={unadjusted > 0 ? "warn" : "default"} hint="reduces what customers owe" />
        <Stat label="Drafts" value={rows.length - posted.length} hint="goods not received back yet" />
      </div>
      <Filters tab="customer" q={q} status={status} />
      {rows.length === 0 ? (
        <EmptyState icon={Undo2} title={q || status ? "No credit notes match these filters" : "No customer returns yet"}
          action={write && !q && !status ? <LinkButton href="/returns/new"><Plus className="h-4 w-4" aria-hidden /> Customer return</LinkButton> : undefined}>
          When a customer sends delivered material back (damaged, excess or the wrong item), record it here. Posting gives a credit note and can put the goods back in stock.
        </EmptyState>
      ) : (
        <Table>
          <thead><tr><Th>Credit note</Th><Th>Date</Th><Th>Customer</Th><Th>Against</Th><Th>Reason</Th><Th className="text-right">Total</Th><Th className="text-right">Balance</Th><Th>Status</Th></tr></thead>
          <tbody>
            {rows.map(({ r, customerName, invNo, orderNo }) => {
              const bal = r.status === "posted" ? noteBalance(r.total, r.adjustedAmount) : null;
              return (
                <tr key={r.id}>
                  <Td><Link href={`/returns/${r.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.status === "draft" ? "Draft" : r.number}</Link></Td>
                  <Td className="whitespace-nowrap">{fmtDate(r.date)}</Td>
                  <Td className="max-w-56 truncate">{customerName ?? "-"}</Td>
                  <Td className="text-sm">{invNo ?? orderNo ?? "-"}{invNo && orderNo && <div className="text-xs text-ink-soft">{orderNo}</div>}</Td>
                  <Td>{reasonLabel(r.reason)}</Td>
                  <Td className="text-right tabular-nums">{money(r.total)}</Td>
                  <Td className="text-right font-medium tabular-nums">{bal == null ? "-" : bal > 0 ? money(bal) : <Badge tone="green">Adjusted</Badge>}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
