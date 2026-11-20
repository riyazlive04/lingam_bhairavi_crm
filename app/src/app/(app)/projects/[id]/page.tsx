import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Pencil, Receipt } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { EXPENSE_CATEGORIES, PROJECT_STATUSES } from "@/lib/constants";
import { fmtDate, money, money0, pct, qty } from "@/lib/format";
import { Badge, Card, DL, EmptyState, Flash, LinkButton, PageHeader, Select, Stat, StatusBadge, Table, Td, Th, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { BudgetBar } from "../_components/budget-bar";
import { projectAccess } from "../_lib/access";
import { loadCostingSheet } from "../_lib/sheet";
import { addProjectNote, setProjectStatus } from "../actions";

const catLabel = (k: string) => EXPENSE_CATEGORIES[k as keyof typeof EXPENSE_CATEGORIES] ?? k;

export default async function ProjectSheetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("projects");
  const { id } = await params;
  const sp = await searchParams;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();
  const db = await getDb();
  const s = await loadCostingSheet(db, pid);
  if (!s) notFound();
  const { project: p, cost: c } = s;
  const acc = projectAccess(user, p);
  const standing = round(c.invoiced - c.received);
  const remainingBudget = round(c.budget - c.actualCost);

  return (
    <div className="space-y-6">
      <PageHeader
        title={p.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{p.code}</span><span aria-hidden>·</span><span>{s.customerName}</span>
            <StatusBadge status={p.status} />
          </span>
        }
        back={{ href: "/projects", label: "Projects" }}
        actions={
          <>
            {acc.spend && (
              <LinkButton variant="secondary" href={`/expenses/new?projectId=${p.id}`}><Receipt className="h-4 w-4" aria-hidden /> Add expense</LinkButton>
            )}
            {acc.full && (
              <a className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-muted" href={`/projects/${p.id}/export`}>
                <Download className="h-4 w-4" aria-hidden /> Excel
              </a>
            )}
            {acc.edit && <LinkButton href={`/projects/${p.id}/edit`}><Pencil className="h-4 w-4" aria-hidden /> Edit</LinkButton>}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />

      {acc.spend ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {acc.full && <Stat label="Contract value" value={money0(c.contractValue)} hint="excl. GST" />}
            <Stat label="Budget" value={money0(c.budget)} hint={c.budget ? `Remaining ${money0(remainingBudget)}` : "not set"} tone={c.budget && remainingBudget < 0 ? "bad" : "default"} />
            <Stat label="Actual cost" value={money0(c.actualCost)} hint={c.pendingExpenses ? `+ ${money0(c.pendingExpenses)} vouchers awaiting approval` : "materials + approved expenses"} />
            {acc.full ? (
              <Stat
                label="Margin"
                value={money0(c.margin)}
                hint={c.contractValue ? `${pct(c.marginPct)} of contract` : "set contract value"}
                tone={c.margin < 0 ? "bad" : c.contractValue && c.marginPct < 10 ? "warn" : "good"}
              />
            ) : (
              <Stat label="Budget used" value={c.budget ? pct(c.budgetUsedPct, 0) : "—"} tone={c.budgetUsedPct > 100 ? "bad" : c.budgetUsedPct >= 80 ? "warn" : "default"} />
            )}
          </div>

          <Card title="Budget burn">
            <BudgetBar usedPct={c.budgetUsedPct} budget={c.budget} />
            {c.budget > 0 && (
              <p className="mt-2 text-sm text-ink-soft">
                {money0(c.actualCost)} of {money0(c.budget)} spent
                {c.budgetUsedPct > 100 && <span className="font-semibold text-red-600"> — over budget by {money0(-remainingBudget)}</span>}
              </p>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Cost breakdown" bodyClassName="p-0">
              <table className="w-full text-sm">
                <tbody>
                  <BreakRow label="Materials issued to site" value={c.materials} />
                  <BreakRow label="Less: materials returned" value={-c.returns} />
                  {Object.entries(c.expensesByCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <BreakRow key={k} label={`Expense — ${catLabel(k)}`} value={v} />
                  ))}
                  {Object.keys(c.expensesByCategory).length === 0 && <BreakRow label="Approved expenses" value={0} />}
                  <tr className="bg-muted font-semibold">
                    <td className="px-4 py-2 text-ink">Actual cost</td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink">{money(c.actualCost)}</td>
                  </tr>
                  {acc.full && (
                    <>
                      <BreakRow label="Contract value" value={c.contractValue} />
                      <tr className={cx("font-semibold", c.margin < 0 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400")}>
                        <td className="px-4 py-2">Profit / margin {c.contractValue ? `(${pct(c.marginPct)})` : ""}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{money(c.margin)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </Card>

            {acc.full ? (
              <Card title="Billed · received · standing" bodyClassName="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    <BreakRow label="Invoiced to customer (excl. GST)" value={c.invoiced} />
                    <BreakRow label="Received from customer" value={c.received} />
                    <tr className={cx("font-semibold", standing > 0 ? "text-amber-700 dark:text-amber-400" : "text-ink")}>
                      <td className="px-4 py-2">Standing (to collect)</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(standing)}</td>
                    </tr>
                    <BreakRow label="Yet to invoice (contract − invoiced)" value={Math.max(0, round(c.contractValue - c.invoiced))} />
                    <tr className={cx("font-semibold", c.received - c.actualCost < 0 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400")}>
                      <td className="px-4 py-2">Cash position (received − spent)</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(round(c.received - c.actualCost))}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="border-t border-line px-4 py-2 text-xs text-ink-soft">Invoice totals here exclude GST; outstanding on the Billing page includes GST.</p>
              </Card>
            ) : (
              <Card title="Project details"><ProjectInfo s={s} /></Card>
            )}
          </div>

          <Section title={`Materials issued (${s.issues.length})`} empty="No materials issued to this project yet. Store issues and project-tagged purchase invoices appear here.">
            {s.issues.length > 0 && (
              <Table>
                <thead><tr><Th>Date</Th><Th>Item</Th><Th className="text-right">Qty</Th>{acc.full && <Th className="text-right">Rate</Th>}<Th className="text-right">Value</Th><Th>Source</Th></tr></thead>
                <tbody>
                  {s.issues.map((m) => (
                    <tr key={m.id}>
                      <Td className="whitespace-nowrap">{fmtDate(m.date)}</Td>
                      <Td><div className="font-medium">{m.itemName}</div><div className="text-xs text-ink-soft">{m.itemCode}</div></Td>
                      <Td className="text-right tabular-nums">{qty(m.absQty)} {m.uom}</Td>
                      {acc.full && <Td className="text-right tabular-nums">{money(m.rate)}</Td>}
                      <Td className="text-right tabular-nums">{money(m.value)}</Td>
                      <Td className="text-xs text-ink-soft">{m.refType === "purchase_invoice" ? "Direct purchase" : m.refType ? m.refType.replace(/_/g, " ") : "Store issue"}</Td>
                    </tr>
                  ))}
                  <tr className="bg-muted font-semibold"><Td colSpan={acc.full ? 4 : 3}>Total issued</Td><Td className="text-right tabular-nums">{money(c.materials)}</Td><Td /></tr>
                </tbody>
              </Table>
            )}
          </Section>

          {s.returns.length > 0 && (
            <Section title={`Materials returned (${s.returns.length})`}>
              <Table>
                <thead><tr><Th>Date</Th><Th>Item</Th><Th className="text-right">Qty</Th>{acc.full && <Th className="text-right">Rate</Th>}<Th className="text-right">Value</Th></tr></thead>
                <tbody>
                  {s.returns.map((m) => (
                    <tr key={m.id}>
                      <Td className="whitespace-nowrap">{fmtDate(m.date)}</Td>
                      <Td>{m.itemName} <span className="text-xs text-ink-soft">{m.itemCode}</span></Td>
                      <Td className="text-right tabular-nums">{qty(m.absQty)} {m.uom}</Td>
                      {acc.full && <Td className="text-right tabular-nums">{money(m.rate)}</Td>}
                      <Td className="text-right tabular-nums">{money(m.value)}</Td>
                    </tr>
                  ))}
                  <tr className="bg-muted font-semibold"><Td colSpan={acc.full ? 4 : 3}>Total returned</Td><Td className="text-right tabular-nums">{money(c.returns)}</Td></tr>
                </tbody>
              </Table>
            </Section>
          )}

          {acc.full && (
            <Section title={`Purchase invoices tagged to this project (${s.purchases.length})`} empty="No purchase invoices are tagged to this project." hint="Posted invoices are already counted in “Materials issued” (direct-to-site purchases). Drafts are not counted until posted.">
              {s.purchases.length > 0 && (
                <Table>
                  <thead><tr><Th>Invoice</Th><Th>Vendor</Th><Th>Date</Th><Th>Status</Th><Th className="text-right">Subtotal</Th><Th className="text-right">Total</Th></tr></thead>
                  <tbody>
                    {s.purchases.map((pi) => (
                      <tr key={pi.id}>
                        <Td><Link className="text-brand-700 hover:underline dark:text-brand-300" href={`/purchases/${pi.id}`}>{pi.invoiceNo}</Link></Td>
                        <Td>{pi.vendorName}</Td>
                        <Td className="whitespace-nowrap">{fmtDate(pi.invoiceDate)}</Td>
                        <Td><StatusBadge status={pi.status} /></Td>
                        <Td className="text-right tabular-nums">{money(pi.subtotal)}</Td>
                        <Td className="text-right tabular-nums">{money(pi.total)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Section>
          )}

          <Section title={`Expense vouchers (${s.expenses.length})`} empty="No expense vouchers allocated to this project yet." hint="Only approved vouchers count in actual cost.">
            {s.expenses.length > 0 && (
              <Table>
                <thead><tr><Th>Voucher</Th><Th>Date</Th><Th>Category</Th><Th>Entered by</Th><Th>Status</Th><Th className="text-right">Allocated</Th></tr></thead>
                <tbody>
                  {s.expenses.map((e) => (
                    <tr key={e.allocationId}>
                      <Td>
                        <Link className="font-medium text-brand-700 hover:underline dark:text-brand-300" href={`/expenses/${e.expenseId}`}>{e.voucherNo}</Link>
                        {e.description && <div className="max-w-64 truncate text-xs text-ink-soft">{e.description}</div>}
                      </Td>
                      <Td className="whitespace-nowrap">{fmtDate(e.date)}</Td>
                      <Td>{catLabel(e.category)}</Td>
                      <Td>{e.userName ?? "—"}</Td>
                      <Td><StatusBadge status={e.status} /></Td>
                      <Td className="text-right tabular-nums">
                        {money(e.amount)}
                        {Math.abs(Number(e.voucherTotal) - Number(e.amount)) > 0.009 && <div className="text-xs text-ink-soft">split of {money0(e.voucherTotal)}</div>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Section>

          {acc.full && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Section title={`Sales invoices (${s.invoices.length})`} empty="Nothing invoiced yet.">
                {s.invoices.length > 0 && (
                  <Table>
                    <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Status</Th><Th className="text-right">Excl. GST</Th><Th className="text-right">Paid</Th></tr></thead>
                    <tbody>
                      {s.invoices.map((i) => (
                        <tr key={i.id}>
                          <Td><Link className="text-brand-700 hover:underline dark:text-brand-300" href={`/billing/invoices/${i.id}`}>{i.number}</Link></Td>
                          <Td className="whitespace-nowrap">{fmtDate(i.invoiceDate)}</Td>
                          <Td><StatusBadge status={i.status} /></Td>
                          <Td className="text-right tabular-nums">{money(i.subtotal)}</Td>
                          <Td className="text-right tabular-nums">{money(i.paidAmount)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Section>
              <Section title={`Receipts (${s.receipts.length})`} empty="No payments received yet.">
                {s.receipts.length > 0 && (
                  <Table>
                    <thead><tr><Th>Date</Th><Th>Invoice</Th><Th>Mode</Th><Th className="text-right">Amount</Th></tr></thead>
                    <tbody>
                      {s.receipts.map((r) => (
                        <tr key={r.id}>
                          <Td className="whitespace-nowrap">{fmtDate(r.date)}</Td>
                          <Td>{r.invoiceNumber}</Td>
                          <Td className="uppercase">{r.mode}{r.reference ? <span className="normal-case text-ink-soft"> · {r.reference}</span> : null}</Td>
                          <Td className="text-right tabular-nums">{money(r.amount)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Section>
            </div>
          )}
        </>
      ) : (
        <Card title="Project details">
          <ProjectInfo s={s} />
          <p className="mt-4 text-sm text-ink-soft">Costing details are visible to the assigned engineer and management.</p>
        </Card>
      )}

      <Section title={`Customer orders & delivery (${s.orders.length})`} empty="No customer orders are linked to this project.">
        {s.orders.length > 0 && (
          <Table>
            <thead><tr><Th>Order</Th><Th>Customer PO</Th><Th>Date</Th><Th>Status</Th><Th>Delivered</Th><Th>Pending lines</Th></tr></thead>
            <tbody>
              {s.orders.map((o) => (
                <tr key={o.id}>
                  <Td><Link className="text-brand-700 hover:underline dark:text-brand-300" href={`/orders/${o.id}`}>{o.number}</Link></Td>
                  <Td>{o.customerPoNumber ?? "—"}</Td>
                  <Td className="whitespace-nowrap">{fmtDate(o.orderDate)}</Td>
                  <Td><StatusBadge status={o.status} /></Td>
                  <Td><BudgetBarNeutral value={o.deliveredPct} /></Td>
                  <Td>{o.pendingLines ? <Badge tone="amber">{o.pendingLines} of {o.lineCount}</Badge> : <Badge tone="green">All delivered</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        {acc.full && <Card title="Project details"><ProjectInfo s={s} /></Card>}
        <Card title="Status & notes">
          {acc.edit && (
            <form action={setProjectStatus} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="id" value={p.id} />
              <label className="block flex-1">
                <span className="mb-1 block text-sm font-medium text-ink">Status</span>
                <Select name="status" defaultValue={p.status}>
                  {PROJECT_STATUSES.map((st) => <option key={st} value={st}>{st.replace("_", " ")}</option>)}
                </Select>
              </label>
              <SubmitButton variant="secondary" pendingText="Updating…">Update status</SubmitButton>
            </form>
          )}
          {p.notes ? (
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm text-ink">{p.notes}</pre>
          ) : (
            <p className="text-sm text-ink-soft">No notes yet.</p>
          )}
          {acc.edit && (
            <form action={addProjectNote} className="mt-3 space-y-2">
              <input type="hidden" name="id" value={p.id} />
              <Textarea name="note" rows={2} required maxLength={2000} placeholder="Add a site update or note…" aria-label="New note" />
              <SubmitButton size="sm" pendingText="Adding…">Add note</SubmitButton>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function BreakRow({ label, value }: { label: string; value: number }) {
  return (
    <tr className="border-b border-line">
      <td className="px-4 py-2 text-ink-soft">{label}</td>
      <td className={cx("px-4 py-2 text-right tabular-nums", value < 0 ? "text-red-600" : "text-ink")}>{money(value)}</td>
    </tr>
  );
}

function BudgetBarNeutral({ value }: { value: number }) {
  const w = Math.max(0, Math.min(100, value));
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-line" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label="Delivered">
        <div className={cx("h-full rounded-full", value >= 100 ? "bg-emerald-600" : "bg-blue-600")} style={{ width: `${w}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-ink-soft">{pct(value, 0)}</span>
    </div>
  );
}

function Section({ title, hint, empty, children }: { title: string; hint?: string; empty?: string; children?: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-1 text-sm font-semibold text-ink">{title}</h2>
      {hint && <p className="mb-2 text-xs text-ink-soft">{hint}</p>}
      {children || (empty ? <EmptyState title={empty} /> : null)}
    </section>
  );
}

function ProjectInfo({ s }: { s: NonNullable<Awaited<ReturnType<typeof loadCostingSheet>>> }) {
  const p = s.project;
  return (
    <DL
      items={[
        ["Code", p.code],
        ["Customer", s.customerName],
        ["Site engineer", s.engineerName ?? "Unassigned"],
        ["Quotation", s.quotationNumber && p.quotationId ? <Link className="text-brand-700 hover:underline dark:text-brand-300" href={`/quotations/${p.quotationId}`}>{s.quotationNumber}</Link> : "—"],
        ["Start", fmtDate(p.startDate)],
        ["End", fmtDate(p.endDate)],
        ["Site address", p.siteAddress || "—"],
      ]}
    />
  );
}
