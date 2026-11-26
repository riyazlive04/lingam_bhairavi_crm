import Link from "next/link";
import { AGEING_LABELS, sumAgeing, type PartyOutstanding } from "@/lib/billing";
import { money0 } from "@/lib/format";
import { EmptyState, cx } from "@/components/ui";
import { ResponsiveTable, StatusPill, type Column, type FooterRow } from "@/components/patterns";

/**
 * Party-wise outstanding with ageing buckets (days past due), on the shared ResponsiveTable.
 * `kind` adds the version 2 columns: customers show credit notes and advances, vendors show debit notes, both show net due.
 * Phones show the party, net due, overdue and the oldest bill; the buckets stay on tablet and desktop.
 */
export function AgeingTable({ rows, hrefFor, emptyTitle, emptyText, limit, kind, flush }: {
  rows: PartyOutstanding[]; hrefFor?: (id: number) => string; emptyTitle: string; emptyText?: string; limit?: number;
  kind?: "customer" | "vendor"; flush?: boolean;
}) {
  if (!rows.length) return <EmptyState title={emptyTitle}>{emptyText}</EmptyState>;
  const shown = limit ? rows.slice(0, limit) : rows;
  const t = sumAgeing(rows);
  const cust = kind === "customer", vend = kind === "vendor";
  const credit = (v: number) => (v ? <span className="text-success">- {money0(v)}</span> : "-");
  const net = (v: number) => (v < -0.5 ? <span className="text-success">{money0(-v)} credit</span> : money0(v));

  const columns: Column<PartyOutstanding>[] = [
    {
      key: "party", header: "Party", card: "title", className: "max-w-60",
      cell: (r) => (
        <>
          {hrefFor
            ? <Link href={hrefFor(r.partyId)} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.name}</Link>
            : <span className="font-medium">{r.name}</span>}
          <div className="text-caption font-normal text-ink-soft">
            {r.invoiceCount ? `${r.invoiceCount} invoice${r.invoiceCount === 1 ? "" : "s"}` : "No open invoices"}{r.autoReminders === false ? " · reminders off" : ""}
          </div>
        </>
      ),
    },
    {
      key: "outstanding", header: kind ? (vend ? "Bills due" : "Invoices due") : "Outstanding", align: "right", nowrap: true,
      card: kind ? "field" : "amount", className: cx(!kind && "font-medium"),
      cell: (r) => (r.outstanding ? money0(r.outstanding) : "-"),
    },
    ...(cust ? [
      { key: "cn", header: "Credit notes", align: "right" as const, nowrap: true, priority: 3 as const, cell: (r: PartyOutstanding) => credit(r.creditNotes) },
      { key: "adv", header: "Advances", align: "right" as const, nowrap: true, priority: 3 as const, cell: (r: PartyOutstanding) => credit(r.advances) },
    ] : []),
    ...(vend ? [{ key: "dn", header: "Debit notes", align: "right" as const, nowrap: true, priority: 3 as const, cell: (r: PartyOutstanding) => credit(r.debitNotes) }] : []),
    ...(kind ? [{ key: "net", header: "Net due", align: "right" as const, nowrap: true, card: "amount" as const, className: "font-medium", cell: (r: PartyOutstanding) => net(r.netDue) }] : []),
    {
      key: "overdue", header: "Overdue", align: "right", nowrap: true,
      cell: (r) => (r.overdue ? <span className="font-medium text-danger">{money0(r.overdue)}</span> : "-"),
    },
    ...AGEING_LABELS.map(([k, l]): Column<PartyOutstanding> => ({
      key: k, header: l, align: "right", nowrap: true, priority: 3, card: k === "d90p" ? "field" : "hidden",
      label: `${l} days`,
      cell: (r) => (r.ageing[k] ? <span className={cx(k === "d90p" && "text-danger")}>{money0(r.ageing[k])}</span> : "-"),
    })),
    {
      key: "oldest", header: "Oldest", card: "badge", align: "right",
      cell: (r) => r.maxDaysOverdue > 0
        ? <StatusPill semantic={r.maxDaysOverdue > 60 ? "danger" : "warning"} label={`${r.maxDaysOverdue} days late`} />
        : <span className="text-ink-faint">-</span>,
    },
  ];

  const footerRows: FooterRow[] = [{
    label: `Total${limit && rows.length > limit ? ` (all ${rows.length})` : ""}`,
    cells: {
      outstanding: money0(t.outstanding),
      cn: credit(t.creditNotes),
      adv: credit(t.advances),
      dn: credit(t.debitNotes),
      net: net(t.netDue),
      overdue: { value: money0(t.overdue), className: "text-danger" },
      ...Object.fromEntries(AGEING_LABELS.map(([k]) => [k, money0(t[k])])),
    },
  }];

  return (
    <ResponsiveTable rows={shown} columns={columns} rowKey={(r) => r.partyId} footerRows={footerRows} flush={flush}
      caption={vend ? "Vendor payables by ageing" : "Customer receivables by ageing"} />
  );
}
