import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Mail } from "lucide-react";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, money, todayIST } from "@/lib/format";
import { customerAdvances, customerLedger, getCompany, openSalesInvoices, receiptNumber } from "@/lib/billing";
import { openCreditNotes } from "@/lib/returns";
import { Badge, Button, Card, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Table, Td, Th, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { emailStatement } from "../../actions";
import { PrintButton } from "../../../orders/_components/print-button";

export const metadata = { title: "Customer ledger" };
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function CustomerLedgerPage({ params, searchParams }: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ from?: string; to?: string; ok?: string; err?: string }>;
}) {
  const user = await requireUser("billing");
  const { customerId: cid } = await params;
  const sp = await searchParams;
  const customerId = Number(cid);
  if (!Number.isInteger(customerId) || customerId <= 0) notFound();
  const db = await getDb();
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!c) notFound();
  const today = todayIST();
  const from = isDate(sp.from) ? sp.from : undefined;
  const to = isDate(sp.to) ? sp.to : undefined;
  const [ledger, open, company, cns, advs] = await Promise.all([
    customerLedger(db, customerId, { from, to }), openSalesInvoices(db, { customerId, today }), getCompany(db),
    openCreditNotes(db, { customerId }), customerAdvances(db, { customerId, openOnly: true }),
  ]);
  const returnsLink = canRead(user.role, "returns");
  const creditTotal = cns.reduce((s, c) => s + c.balance, 0) + advs.reduce((s, a) => s + a.balance, 0);
  const write = canWrite(user.role, "billing");
  const overdue = open.filter((o) => o.daysOverdue > 0).reduce((s, o) => s + o.outstanding, 0);

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={c.name}
          subtitle={<>Statement of account{c.email ? ` · ${c.email}` : " · no e-mail on file"}{c.phone ? ` · ${c.phone}` : ""} · {c.paymentTermsDays} days credit{!c.autoReminders && " · automatic reminders off"}</>}
          back={{ href: "/billing/receivables", label: "Receivables" }}
          actions={<>
            <PrintButton label="Print statement" />
            {write && (
              <form action={emailStatement}>
                <input type="hidden" name="customerId" value={c.id} />
                <SubmitButton variant="secondary" disabled={!c.email} pendingText="Sending…" confirm={`E-mail the full statement to ${c.email ?? "the customer"}?`}>
                  <Mail className="h-4 w-4" aria-hidden /> Email statement
                </SubmitButton>
              </form>
            )}
          </>}
        />
        <Flash ok={sp.ok} err={sp.err} />
      </div>

      <div className="print-area">
        <div className="mb-4 hidden print:block">
          <h1 className="text-lg font-bold">{company.name}: Statement of account</h1>
          <p>{c.name} · as on {fmtDate(today)}{from || to ? ` · period ${fmtDate(from) } to ${fmtDate(to ?? today)}` : ""}</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Balance</div><div className="mt-1 text-xl font-semibold tabular-nums">{money(ledger.closing)}</div>{creditTotal > 0.005 && <div className="text-xs text-ink-soft">after {money(creditTotal)} unused credits</div>}</div>
          <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Overdue</div><div className={cx("mt-1 text-xl font-semibold tabular-nums", overdue > 0 && "text-red-600")}>{money(overdue)}</div></div>
          <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Invoiced (period)</div><div className="mt-1 text-xl font-semibold tabular-nums">{money(ledger.debit)}</div></div>
          <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Received (period)</div><div className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">{money(ledger.credit)}</div></div>
        </div>

        {open.length > 0 && (
          <Card title={`Open invoices (${open.length})`} className="mb-4" bodyClassName="p-0">
            <Table className="rounded-none border-0 shadow-none">
              <thead><tr><Th>Invoice</Th><Th>Date</Th><Th>Due</Th><Th className="text-right">Total</Th><Th className="text-right">Outstanding</Th><Th>Status</Th><Th className="text-right">Reminders</Th></tr></thead>
              <tbody>
                {open.map((o) => (
                  <tr key={o.id}>
                    <Td><Link href={`/billing/invoices/${o.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{o.number}</Link></Td>
                    <Td className="whitespace-nowrap">{fmtDate(o.invoiceDate)}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(o.dueDate)}</Td>
                    <Td className="text-right tabular-nums">{money(o.total)}</Td>
                    <Td className="text-right font-medium tabular-nums">{money(o.outstanding)}</Td>
                    <Td>{o.daysOverdue > 0 ? <Badge tone="red">{o.daysOverdue}d overdue</Badge> : o.daysOverdue === 0 ? <Badge tone="amber">due today</Badge> : <Badge tone="blue">due in {-o.daysOverdue}d</Badge>}</Td>
                    <Td className="text-right tabular-nums">{o.reminderCount || "-"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        {(cns.length > 0 || advs.length > 0) && (
          <Card title={`Credits not yet used (${cns.length + advs.length})`} subtitle="Adjust these against open invoices" className="mb-4" bodyClassName="p-0">
            <Table className="rounded-none border-0 shadow-none">
              <thead><tr><Th>Type</Th><Th>Ref</Th><Th>Date</Th><Th className="text-right">Amount</Th><Th className="text-right">Used</Th><Th className="text-right">Balance</Th></tr></thead>
              <tbody>
                {cns.map((c) => (
                  <tr key={`cn-${c.id}`}>
                    <Td><Badge tone="violet">Credit note</Badge></Td>
                    <Td>{returnsLink ? <Link href={`/returns/${c.id}`} className="text-brand-700 hover:underline dark:text-brand-300">{c.number}</Link> : c.number}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(c.date)}</Td>
                    <Td className="text-right tabular-nums">{money(c.total)}</Td><Td className="text-right tabular-nums">{money(c.adjustedAmount)}</Td>
                    <Td className="text-right font-medium tabular-nums">{money(c.balance)}</Td>
                  </tr>
                ))}
                {advs.map((a) => (
                  <tr key={`adv-${a.id}`}>
                    <Td><Badge tone="blue">Advance</Badge></Td>
                    <Td><Link href={`/billing/receipts/${a.id}`} className="text-brand-700 hover:underline dark:text-brand-300">{a.reference || receiptNumber(a)}</Link>{a.orderNumber && <div className="text-xs text-ink-soft">{a.orderNumber}</div>}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(a.date)}</Td>
                    <Td className="text-right tabular-nums">{money(a.amount)}</Td><Td className="text-right tabular-nums">{money(a.allocatedAmount)}</Td>
                    <Td className="text-right font-medium tabular-nums">{money(a.balance)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        <Card title="Ledger" bodyClassName="p-0">
          <form method="get" className="no-print flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-end">
            <Field label="From"><Input type="date" name="from" defaultValue={from} /></Field>
            <Field label="To"><Input type="date" name="to" defaultValue={to} /></Field>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">Apply</Button>
              {(from || to) && <LinkButton href={`/billing/receivables/${c.id}`} variant="ghost">All time</LinkButton>}
            </div>
          </form>
          {ledger.entries.length === 0 && !ledger.opening ? (
            <div className="p-4"><EmptyState title="No transactions">No invoices, payments or credit notes for this customer{from || to ? " in this period" : ""}.</EmptyState></div>
          ) : (
            <Table className="rounded-none border-0 shadow-none">
              <thead><tr><Th>Date</Th><Th>Ref</Th><Th>Particulars</Th><Th className="text-right">Debit</Th><Th className="text-right">Credit</Th><Th className="text-right">Balance</Th></tr></thead>
              <tbody>
                {from && (
                  <tr><Td className="whitespace-nowrap">{fmtDate(from)}</Td><Td>-</Td><Td>Opening balance</Td><Td /><Td /><Td className="text-right tabular-nums">{money(ledger.opening)}</Td></tr>
                )}
                {ledger.entries.map((e) => (
                  <tr key={`${e.kind}-${e.refId}`}>
                    <Td className="whitespace-nowrap">{fmtDate(e.date)}</Td>
                    <Td>{e.kind === "invoice" ? <Link href={`/billing/invoices/${e.refId}`} className="text-brand-700 hover:underline dark:text-brand-300">{e.ref}</Link>
                      : e.kind === "credit_note" ? (returnsLink ? <Link href={`/returns/${e.refId}`} className="text-brand-700 hover:underline dark:text-brand-300">{e.ref}</Link> : e.ref)
                        : <Link href={`/billing/receipts/${e.refId}`} className="text-brand-700 hover:underline dark:text-brand-300">{e.ref}</Link>}</Td>
                    <Td className="max-w-80 whitespace-normal">{e.description}</Td>
                    <Td className="text-right tabular-nums">{e.debit ? money(e.debit) : ""}</Td>
                    <Td className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{e.credit ? money(e.credit) : ""}</Td>
                    <Td className="text-right tabular-nums">{money(e.balance)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-semibold"><Td colSpan={3} className="text-right">Closing balance</Td><Td className="text-right tabular-nums">{money(ledger.debit)}</Td><Td className="text-right tabular-nums">{money(ledger.credit)}</Td><Td className="text-right tabular-nums">{money(ledger.closing)}</Td></tr>
              </tfoot>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
