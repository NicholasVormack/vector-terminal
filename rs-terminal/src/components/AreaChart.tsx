import type { EquityPoint } from '../types';
import { fmtDate, fmtGp, fmtGpShort } from '../lib/format';
import { useElementWidth } from '../lib/useElementWidth';

interface Props {
  points: EquityPoint[];
  bench?: EquityPoint[];
  kind: 'equity' | 'drawdown';
  height?: number;
}

const PAD = { l: 8, r: 74, t: 10, b: 18 };

export function AreaChart({ points, bench, kind, height = 190 }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>(640);
  const innerW = Math.max(20, width - PAD.l - PAD.r);
  const innerH = Math.max(20, height - PAD.t - PAD.b);

  if (points.length < 2) return <div className="chart-empty" style={{ height }}>Not enough data</div>;

  const values = [...points.map((p) => p.v), ...(bench ?? []).map((p) => p.v)];
  let lo = Math.min(...values, kind === 'drawdown' ? 0 : Infinity);
  let hi = Math.max(...values, kind === 'drawdown' ? 0 : -Infinity);
  if (kind === 'drawdown') hi = 0;
  if (hi === lo) hi = lo + 1;
  const span = hi - lo;
  lo -= span * 0.05;
  hi += span * 0.05;

  const xOf = (i: number, n: number) => PAD.l + (i / Math.max(1, n - 1)) * innerW;
  const yOf = (v: number) => PAD.t + innerH * (1 - (v - lo) / (hi - lo));

  const line = (series: EquityPoint[]) =>
    series.map((p, i) => `${i ? 'L' : 'M'}${xOf(i, series.length).toFixed(2)},${yOf(p.v).toFixed(2)}`).join('');

  const baseline = kind === 'drawdown' ? yOf(0) : PAD.t + innerH;
  const d = line(points);
  const area = `${d}L${xOf(points.length - 1, points.length).toFixed(2)},${baseline}L${xOf(0, points.length).toFixed(2)},${baseline}Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
  const last = points[points.length - 1];
  const fmt = (v: number) => (kind === 'drawdown' ? `${(v * 100).toFixed(1)}%` : fmtGpShort(v));

  return (
    <div className="area-chart" ref={ref} style={{ height }}>
      <svg width={width} height={height}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={PAD.l + innerW} y1={yOf(v)} y2={yOf(v)} className="grid" />
            <text x={PAD.l + innerW + 8} y={yOf(v) + 3.5} className="axis-label">
              {fmt(v)}
            </text>
          </g>
        ))}

        <path d={area} className={kind === 'drawdown' ? 'area-fill down' : 'area-fill'} />
        {bench && kind === 'equity' && (
          <path d={line(bench)} fill="none" stroke="var(--muted-2)" strokeWidth={1.2} strokeDasharray="3 3" opacity={0.85} />
        )}
        <path d={d} fill="none" stroke={kind === 'drawdown' ? 'var(--down)' : 'var(--accent)'} strokeWidth={1.6} strokeLinejoin="round" />

        <text x={PAD.l} y={height - 5} className="axis-label">
          {fmtDate(points[0].t)}
        </text>
        <text x={PAD.l + innerW} y={height - 5} className="axis-label" textAnchor="end">
          {fmtDate(last.t)}
        </text>

        <g>
          <rect x={PAD.l + innerW + 2} y={yOf(last.v) - 8} width={68} height={16} rx={2} className="xhair-tag" />
          <text x={PAD.l + innerW + 36} y={yOf(last.v) + 4} className="last-tag-text" textAnchor="middle">
            {kind === 'drawdown' ? `${(last.v * 100).toFixed(1)}%` : fmtGp(last.v)}
          </text>
        </g>
      </svg>
    </div>
  );
}
