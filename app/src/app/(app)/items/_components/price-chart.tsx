import { fmtDate, money0 } from "@/lib/format";

type Pt = { date: string; rate: number; label?: string };

/**
 * Inline SVG line chart of rate over time (no chart library). Server-renderable.
 * Points are plotted on a true time axis; each point has a native tooltip.
 */
export function PriceChart({ points, title = "Purchase rate over time" }: { points: Pt[]; title?: string }) {
  if (points.length === 0) return <p className="text-sm text-ink-soft">No purchase prices yet. Post a purchase invoice to start the history.</p>;
  const W = 640, H = 220, L = 64, R = 16, T = 16, B = 32;
  const ts = points.map((p) => new Date(p.date + "T00:00:00Z").getTime());
  const rates = points.map((p) => p.rate);
  let tMin = Math.min(...ts), tMax = Math.max(...ts);
  if (tMin === tMax) { tMin -= 15 * 86400000; tMax += 15 * 86400000; }
  let rMin = Math.min(...rates), rMax = Math.max(...rates);
  const pad = (rMax - rMin) * 0.12 || rMax * 0.1 || 1;
  rMin = Math.max(0, rMin - pad); rMax = rMax + pad;
  const x = (t: number) => L + ((t - tMin) / (tMax - tMin)) * (W - L - R);
  const y = (r: number) => T + (1 - (r - rMin) / (rMax - rMin)) * (H - T - B);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(ts[i]).toFixed(1)},${y(p.rate).toFixed(1)}`).join(" ");
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => rMin + f * (rMax - rMin));
  const xTicks = [0, 0.5, 1].map((f) => tMin + f * (tMax - tMin));
  const last = points[points.length - 1];

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${points.length} points, latest ${money0(last.rate)} on ${fmtDate(last.date)}`} className="h-auto w-full text-ink-soft">
        <title>{title}</title>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-chart-grid" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="currentColor">{money0(v)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={H - 10} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fontSize={11} fill="currentColor">
            {fmtDate(new Date(t).toISOString().slice(0, 10))}
          </text>
        ))}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="stroke-chart-axis" />
        <path d={path} fill="none" className="stroke-chart-1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(ts[i])} cy={y(p.rate)} r={3.5} className="fill-chart-1" stroke="var(--chart-surface)" strokeWidth={1.5}>
            <title>{`${fmtDate(p.date)} · ${money0(p.rate)}${p.label ? ` · ${p.label}` : ""}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="sr-only">{title}</figcaption>
    </figure>
  );
}
