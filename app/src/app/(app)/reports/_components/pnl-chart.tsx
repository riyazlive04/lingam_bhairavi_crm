import { money0, moneyShort } from "@/lib/format";
import { monthLabel, type PnlMonth } from "@/lib/reports";

/**
 * Monthly P&L chart, inline SVG (no chart library). One money axis:
 * grouped bars for sales, cost of goods and expenses, a line for net profit.
 * Colours are the shared chart tokens (chart-1 to chart-4, in fixed order), which switch for dark mode.
 */
const SERIES = [
  { key: "sales", label: "Sales", cls: "fill-chart-1", swatch: "bg-chart-1" },
  { key: "cogs", label: "Cost of goods", cls: "fill-chart-2", swatch: "bg-chart-2" },
  { key: "expenses", label: "Expenses", cls: "fill-chart-3", swatch: "bg-chart-3" },
] as const;

export function PnlChart({ months }: { months: PnlMonth[] }) {
  const W = 760, H = 280, padL = 60, padR = 12, padT = 14, padB = 30;
  const values = months.flatMap((m) => [m.sales, m.cogs, m.expenses, m.netProfit]);
  const rawMax = Math.max(1, ...values);
  const rawMin = Math.min(0, ...values);
  const step = niceStep((rawMax - rawMin) / 4);
  const top = Math.ceil(rawMax / step) * step;
  const bottom = Math.floor(rawMin / step) * step;
  const y = (v: number) => padT + (H - padT - padB) * ((top - v) / (top - bottom || 1));
  const groupW = (W - padL - padR) / Math.max(1, months.length);
  const barW = Math.max(3, Math.min(14, (groupW - 10) / 3 - 2));
  const ticks: number[] = [];
  for (let t = bottom; t <= top + 1e-6; t += step) ticks.push(t);
  const zero = y(0);
  const bar = (x: number, v: number) => {
    if (!v) return "";
    const yy = y(v), r = Math.min(3, Math.abs(zero - yy), barW / 2);
    // rounded data end, square on the baseline
    return v > 0
      ? `M${x},${zero} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy + r} V${zero} Z`
      : `M${x},${zero} V${yy - r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy - r} V${zero} Z`;
  };
  const cx = (i: number) => padL + i * groupW + groupW / 2;
  const line = months.map((m, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${y(m.netProfit).toFixed(1)}`).join(" ");
  const empty = months.every((m) => !m.sales && !m.cogs && !m.expenses);

  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-soft">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${s.swatch}`} aria-hidden /> {s.label}</span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-chart-4" aria-hidden /> Net profit</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Monthly sales, cost of goods, expenses and net profit. The table below has the same numbers.">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-chart-axis" : "stroke-chart-grid"} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-soft text-[11px]">{moneyShort(t)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const gx = padL + i * groupW + (groupW - (barW * 3 + 4)) / 2;
          return (
            <g key={m.month}>
              {SERIES.map((s, k) => <path key={s.key} d={bar(gx + k * (barW + 2), m[s.key])} className={s.cls} />)}
              <text x={cx(i)} y={H - 10} textAnchor="middle" className="fill-ink-soft text-[11px]">{monthLabel(m.month, true)}</text>
            </g>
          );
        })}
        {!empty && <path d={line} fill="none" className="stroke-chart-4" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {!empty && months.map((m, i) => (
          <circle key={m.month} cx={cx(i)} cy={y(m.netProfit)} r={4} className="fill-chart-4 stroke-surface" strokeWidth={2} />
        ))}
        {/* hover targets: one per month, with the full numbers in a native tooltip */}
        {months.map((m, i) => (
          <rect key={m.month} x={padL + i * groupW} y={padT} width={groupW} height={H - padT - padB} fill="transparent" className="hover:fill-ink/5">
            <title>{`${monthLabel(m.month)}\nSales ${money0(m.sales)}\nCost of goods ${money0(m.cogs)}\nExpenses ${money0(m.expenses)}\nGross profit ${money0(m.grossProfit)}\nNet profit ${money0(m.netProfit)}`}</title>
          </rect>
        ))}
        {empty && <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-ink-faint text-[13px]">No sales, deliveries or expenses in this period</text>}
      </svg>
    </figure>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
