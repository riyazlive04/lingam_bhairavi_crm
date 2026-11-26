/**
 * Grouped bar chart in inline SVG (no chart library), with an optional line series on the same axis.
 * One y axis, categorical colours chart-1 to chart-8 in fixed order, a legend for 2 or more series,
 * an accessible title and description, native tooltips per category, and an optional
 * "Show the numbers as a table" disclosure. Server-safe. Maintainer: Sirah Digital.
 */
import { money0, moneyShort, qty } from "@/lib/format";

/** Palette slot, 1 to 8 (see --chart-1..8 in globals.css). Assign in fixed order, never by rank. */
export type ChartColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ChartSeries<D> = {
  key: string; label: string; value: (d: D) => number; color?: ChartColor;
  /** Shorter name for tooltips and the table header, e.g. "Sales" for the legend's "Sales (invoiced)". */
  shortLabel?: string;
};

export type BarChartProps<D> = {
  data: D[];
  /** Short category label under each group, e.g. "Apr 26". */
  category: (d: D) => string;
  /** Long label for tooltips and the table, e.g. "April 2026". Defaults to `category`. */
  categoryLong?: (d: D) => string;
  /** Bars, drawn left to right in each group. Colours default to chart-1, chart-2, ... in this order. */
  series: ChartSeries<D>[];
  /** Optional line on the same axis (for example net profit). Defaults to the next colour after the bars. */
  line?: ChartSeries<D>;
  /** Accessible name of the chart (also the table caption). */
  title: string;
  /** Accessible description, e.g. "The table below has the same numbers." */
  description?: string;
  /** "money" (default): axis in ₹ L / Cr, tooltips in rupees. "number": plain quantities. */
  format?: "money" | "number";
  /** Extra tooltip lines per category, e.g. [["Gross profit", money0(m.grossProfit)]]. */
  tooltipExtra?: (d: D) => [string, string][];
  /** Add the "Show the numbers as a table" disclosure under the chart. Leave off when a table already follows. */
  table?: boolean;
  /** Shown in the middle when every value is zero. */
  emptyText?: string;
  /** Header of the first table column. Default "Month". */
  categoryHeader?: string;
  width?: number;
  height?: number;
};

const FILL = ["fill-chart-1", "fill-chart-2", "fill-chart-3", "fill-chart-4", "fill-chart-5", "fill-chart-6", "fill-chart-7", "fill-chart-8"] as const;
const STROKE = ["stroke-chart-1", "stroke-chart-2", "stroke-chart-3", "stroke-chart-4", "stroke-chart-5", "stroke-chart-6", "stroke-chart-7", "stroke-chart-8"] as const;
const SWATCH = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6", "bg-chart-7", "bg-chart-8"] as const;

/** A "nice" tick step (1, 2 or 5 times a power of ten) at or above `raw`. */
export function niceStep(raw: number) {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-+|-+$/g, "") || "chart";

/**
 * @example
 * <BarChart title="Invoiced sales and quoted value, last six months" description="The table below has the same numbers."
 *   data={series} category={(d) => monthLabel(d.month, true)} categoryLong={(d) => monthLabel(d.month)}
 *   series={[{ key: "sales", label: "Sales (invoiced)", value: (d) => d.sales }, { key: "quoted", label: "Quoted", value: (d) => d.quoted }]}
 *   table emptyText="No quotes or invoices yet" />
 * @example With a line series
 * <BarChart ... series={[sales, cogs, expenses]} line={{ key: "net", label: "Net profit", value: (m) => m.netProfit }} />
 */
export function BarChart<D>({
  data, category, categoryLong, series, line, title, description, format = "money", tooltipExtra, table, emptyText = "Nothing to show for this period",
  categoryHeader = "Month", width: W = 760, height: H = 280,
}: BarChartProps<D>) {
  const padL = format === "money" ? 60 : 44, padR = 12, padT = 14, padB = 30;
  const long = categoryLong ?? category;
  const axisFmt = format === "money" ? moneyShort : (v: number) => qty(v);
  const fullFmt = format === "money" ? money0 : (v: number) => qty(v);
  const colorOf = (s: ChartSeries<D>, i: number) => ((s.color ?? i + 1) - 1) % 8;
  const lineColor = line ? ((line.color ?? series.length + 1) - 1) % 8 : 0;

  const all = data.flatMap((d) => [...series.map((s) => s.value(d)), ...(line ? [line.value(d)] : [])]);
  const rawMax = Math.max(1, ...all);
  const rawMin = Math.min(0, ...all);
  const step = niceStep((rawMax - rawMin) / 4);
  const top = Math.ceil(rawMax / step) * step;
  const bottom = Math.floor(rawMin / step) * step;
  const y = (v: number) => padT + (H - padT - padB) * ((top - v) / (top - bottom || 1));
  const zero = y(0);
  const n = Math.max(1, series.length);
  const gap = 2;
  const groupW = (W - padL - padR) / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(n <= 2 ? 24 : 14, (groupW - 12) / n - gap));
  const ticks: number[] = [];
  for (let t = bottom; t <= top + 1e-6; t += step) ticks.push(t);
  const mid = (i: number) => padL + i * groupW + groupW / 2;

  const bar = (x: number, v: number) => {
    if (!v) return "";
    const yy = y(v), r = Math.min(3, Math.abs(zero - yy), barW / 2);
    // rounded data end, square on the baseline
    return v > 0
      ? `M${x},${zero} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy + r} V${zero} Z`
      : `M${x},${zero} V${yy - r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy - r} V${zero} Z`;
  };
  const empty = all.every((v) => !v);
  const linePath = line ? data.map((d, i) => `${i ? "L" : "M"}${mid(i).toFixed(1)},${y(line.value(d)).toFixed(1)}`).join(" ") : "";
  const id = `chart-${slug(title)}`;
  const legend = [...series.map((s, i) => ({ key: s.key, label: s.label, c: colorOf(s, i), line: false })), ...(line ? [{ key: line.key, label: line.label, c: lineColor, line: true }] : [])];

  return (
    <figure>
      {legend.length > 1 && (
        <figcaption className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-soft">
          {legend.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5">
              <span className={l.line ? `h-0.5 w-4 rounded ${SWATCH[l.c]}` : `h-2.5 w-2.5 rounded-sm ${SWATCH[l.c]}`} aria-hidden /> {l.label}
            </span>
          ))}
        </figcaption>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby={description ? `${id}-t ${id}-d` : `${id}-t`}>
        <title id={`${id}-t`}>{title}</title>
        {description && <desc id={`${id}-d`}>{description}</desc>}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-chart-axis" : "stroke-chart-grid"} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-soft text-[11px]">{axisFmt(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = padL + i * groupW + (groupW - (barW * n + gap * (n - 1))) / 2;
          return (
            <g key={`${category(d)}-${i}`}>
              {series.map((s, k) => <path key={s.key} d={bar(gx + k * (barW + gap), s.value(d))} className={FILL[colorOf(s, k)]} />)}
              <text x={mid(i)} y={H - 10} textAnchor="middle" className="fill-ink-soft text-[11px]">{category(d)}</text>
            </g>
          );
        })}
        {line && !empty && (
          <>
            <path d={linePath} fill="none" className={STROKE[lineColor]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => <circle key={i} cx={mid(i)} cy={y(line.value(d))} r={4} className={`${FILL[lineColor]} stroke-surface`} strokeWidth={2} />)}
          </>
        )}
        {/* hover targets: one per category, larger than the bars, with the full numbers in a native tooltip */}
        {data.map((d, i) => (
          <rect key={i} x={padL + i * groupW} y={padT} width={groupW} height={H - padT - padB} fill="transparent" className="hover:fill-ink/5">
            <title>{[long(d), ...series.map((s) => `${s.shortLabel ?? s.label} ${fullFmt(s.value(d))}`), ...(tooltipExtra?.(d) ?? []).map(([k, v]) => `${k} ${v}`),
              ...(line ? [`${line.shortLabel ?? line.label} ${fullFmt(line.value(d))}`] : [])].join("\n")}</title>
          </rect>
        ))}
        {empty && <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-ink-faint text-[13px]">{emptyText}</text>}
      </svg>

      {table && (
        <details className="mt-3 rounded-xl border border-line">
          <summary className="flex min-h-10 cursor-pointer list-none items-center px-3 text-sm font-medium text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
            Show the numbers as a table
          </summary>
          <div className="overflow-x-auto border-t border-line">
            <table className="ui-table">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <th scope="col" className="ui-th">{categoryHeader}</th>
                  {[...series, ...(line ? [line] : [])].map((s) => <th key={s.key} scope="col" className="ui-th text-right">{s.shortLabel ?? s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.map((d, i) => (
                  <tr key={i}>
                    <td className="ui-td">{long(d)}</td>
                    {[...series, ...(line ? [line] : [])].map((s) => <td key={s.key} className="ui-td text-right tabular-nums">{fullFmt(s.value(d))}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
