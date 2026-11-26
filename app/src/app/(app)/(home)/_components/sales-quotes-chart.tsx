import { money0, moneyShort } from "@/lib/format";

/**
 * Sales vs quotes, grouped bars, inline SVG (no chart library). One money axis.
 * Series colours follow the P&L chart so the same entity keeps its colour: sales is chart-1, quoted is chart-2.
 * A table with the same numbers sits under the chart.
 */
export type SalesQuotesPoint = { month: string; quoted: number; sales: number };

const SERIES = [
  { key: "sales", label: "Sales (invoiced)", cls: "fill-chart-1", swatch: "bg-chart-1" },
  { key: "quoted", label: "Quoted (sent quotes)", cls: "fill-chart-2", swatch: "bg-chart-2" },
] as const;

const label = (m: string, short = true) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: short ? "short" : "long", year: short ? "2-digit" : "numeric", timeZone: "UTC" });

export function SalesQuotesChart({ data }: { data: SalesQuotesPoint[] }) {
  const W = 640, H = 240, padL = 56, padR = 8, padT = 12, padB = 28;
  const max = Math.max(1, ...data.flatMap((d) => [d.quoted, d.sales]));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const groupW = (W - padL - padR) / Math.max(1, data.length);
  const gap = 2;
  const barW = Math.max(4, Math.min(24, (groupW - 20) / 2));
  const base = H - padB;
  const bar = (x: number, v: number) => {
    const yy = y(v), h = base - yy, r = Math.min(4, h, barW / 2);
    if (h <= 0) return "";
    // rounded data end, square on the baseline
    return `M${x},${base} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy + r} V${base} Z`;
  };
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const empty = data.every((d) => !d.quoted && !d.sales);

  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-soft">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${s.swatch}`} aria-hidden /> {s.label}</span>
        ))}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Invoiced sales and quoted value for the last six months. The table below has the same numbers.">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-chart-axis" : "stroke-chart-grid"} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-soft text-[11px]">{moneyShort(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = padL + i * groupW + (groupW - (barW * 2 + gap)) / 2;
          return (
            <g key={d.month}>
              {SERIES.map((s, k) => <path key={s.key} d={bar(gx + k * (barW + gap), d[s.key])} className={s.cls} />)}
              <text x={padL + i * groupW + groupW / 2} y={H - 8} textAnchor="middle" className="fill-ink-soft text-[11px]">{label(d.month)}</text>
            </g>
          );
        })}
        {/* hover targets: one per month, larger than the bars, with the numbers in a native tooltip */}
        {data.map((d, i) => (
          <rect key={d.month} x={padL + i * groupW} y={padT} width={groupW} height={H - padT - padB} fill="transparent" className="hover:fill-ink/5">
            <title>{`${label(d.month, false)}\nSales ${money0(d.sales)}\nQuoted ${money0(d.quoted)}`}</title>
          </rect>
        ))}
        {empty && <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-ink-faint text-[13px]">No quotes or invoices yet</text>}
      </svg>

      <details className="group mt-3 rounded-xl border border-line">
        <summary className="flex min-h-10 cursor-pointer list-none items-center px-3 text-sm font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
          Show the numbers as a table
        </summary>
        <div className="overflow-x-auto border-t border-line">
          <table className="ui-table">
            <caption className="sr-only">Sales and quoted value by month</caption>
            <thead><tr><th scope="col" className="ui-th">Month</th><th scope="col" className="ui-th text-right">Sales</th><th scope="col" className="ui-th text-right">Quoted</th></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month}>
                  <td className="ui-td">{label(d.month, false)}</td>
                  <td className="ui-td text-right tabular-nums">{money0(d.sales)}</td>
                  <td className="ui-td text-right tabular-nums">{money0(d.quoted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
