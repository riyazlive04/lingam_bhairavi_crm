import Link from "next/link";
import { AGEING_LABELS, sumAgeing, type PartyOutstanding } from "@/lib/billing";
import { money0 } from "@/lib/format";
import { Badge, EmptyState, Table, Td, Th, cx } from "@/components/ui";

/** Party-wise outstanding with ageing buckets (days past due). */
export function AgeingTable({ rows, hrefFor, emptyTitle, limit }: { rows: PartyOutstanding[]; hrefFor?: (id: number) => string; emptyTitle: string; limit?: number }) {
  if (!rows.length) return <EmptyState title={emptyTitle} />;
  const shown = limit ? rows.slice(0, limit) : rows;
  const t = sumAgeing(rows);
  return (
    <Table>
      <thead>
        <tr>
          <Th>Party</Th><Th className="text-right">Outstanding</Th><Th className="text-right">Overdue</Th>
          {AGEING_LABELS.map(([k, l]) => <Th key={k} className="text-right">{l}</Th>)}
          <Th className="text-right">Oldest</Th>
        </tr>
      </thead>
      <tbody>
        {shown.map((r) => (
          <tr key={r.partyId} className="hover:bg-muted/50">
            <Td className="max-w-60">
              {hrefFor ? <Link href={hrefFor(r.partyId)} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.name}</Link> : <span className="font-medium">{r.name}</span>}
              <div className="text-xs text-ink-soft">{r.invoiceCount} invoice{r.invoiceCount === 1 ? "" : "s"}{r.autoReminders === false ? " · reminders off" : ""}</div>
            </Td>
            <Td className="text-right font-medium tabular-nums">{money0(r.outstanding)}</Td>
            <Td className={cx("text-right tabular-nums", r.overdue > 0 && "font-medium text-red-600")}>{r.overdue ? money0(r.overdue) : "—"}</Td>
            {AGEING_LABELS.map(([k]) => (
              <Td key={k} className={cx("text-right tabular-nums", k === "d90p" && r.ageing[k] > 0 && "text-red-600")}>{r.ageing[k] ? money0(r.ageing[k]) : "—"}</Td>
            ))}
            <Td className="text-right">{r.maxDaysOverdue > 0 ? <Badge tone={r.maxDaysOverdue > 60 ? "red" : "amber"}>{r.maxDaysOverdue}d</Badge> : <span className="text-ink-faint">—</span>}</Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="bg-muted font-semibold">
          <Td>Total{limit && rows.length > limit ? ` (all ${rows.length})` : ""}</Td>
          <Td className="text-right tabular-nums">{money0(t.outstanding)}</Td>
          <Td className="text-right tabular-nums text-red-600">{money0(t.overdue)}</Td>
          {AGEING_LABELS.map(([k]) => <Td key={k} className="text-right tabular-nums">{money0(t[k])}</Td>)}
          <Td />
        </tr>
      </tfoot>
    </Table>
  );
}
