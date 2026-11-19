import { useMemo } from 'react';
import type { EquityPoint } from '../types';
import { fmtMoney, fmtPct, fmtShortDate } from '../lib/format';
import { useElementWidth } from '../lib/useElementWidth';

interface Props {
  series: EquityPoint[];
  benchmark?: EquityPoint[];
  height?: number;
  mode?: 'equity' | 'drawdown';
  color?: string;
}

export function AreaChart({ series, benchmark, height = 190, mode = 'equity', color = 'var(--accent)' }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>(600);
  const pad = { l: 6, r: 62, t: 10, b: 18 };
  const innerW = Math.max(20, width - pad.l - pad.r);
  const innerH = Math.max(20, height - pad.t - pad.b);

  const { lo, hi } = useMemo(() => {
    const vals = [...series.map((p) => p.v), ...(benchmark?.map((p) => p.v) ?? [])];
    if (mode === 'drawdown') {
      const m = Math.min(0, ...vals);
      return { lo: m * 1.1, hi: 0 };
    }
    return { lo: Math.min(...vals), hi: Math.max(...vals) };
  }, [series, benchmark, mode]);

  const span = Math.max(1e-9, hi - lo);
  const x = (i: number) => pad.l + (i / Math.max(1, series.length - 1)) * innerW;
  const y = (v: number) => pad.t + innerH * (1 - (v - lo) / span);

  const path = (pts: EquityPoint[]) => {
    if (!pts.length) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  };

  const area = () => {
    if (!series.length) return '';
    const base = mode === 'drawdown' ? y(0) : y(lo);
    return `${path(series)}L${x(series.length - 1).toFixed(1)},${base.toFixed(1)}L${x(0).toFixed(1)},${base.toFixed(1)}Z`;
  };

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * span);
  const last = series[series.length - 1];
  const lastColor = mode === 'drawdown' ? 'var(--down)' : color;

  if (!series.length) return <div className="chart-empty">No curve</div>;

  return (
    <div className="area-chart" ref={ref} style={{ height }}>
      <svg width={width} height={height}>
        <defs>
          <linearGradient id={`grad-${mode}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mode === 'drawdown' ? '#ff5a5f' : '#2ee6a8'} stopOpacity={0.28} />
            <stop offset="100%" stopColor={mode === 'drawdown' ? '#ff5a5f' : '#2ee6a8'} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={pad.l + innerW} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l + innerW + 8} y={y(t) + 3.5} className="axis-label">
              {mode === 'drawdown' ? fmtPct(t, 1) : fmtMoney(t)}
            </text>
          </g>
        ))}
        {benchmark && benchmark.length > 1 && (
          <path d={path(benchmark)} fill="none" stroke="var(--muted-2)" strokeWidth={1.1} strokeDasharray="4 3" opacity={0.8} />
        )}
        <path d={area()} fill={`url(#grad-${mode})`} />
        <path d={path(series)} fill="none" stroke={lastColor} strokeWidth={1.6} strokeLinejoin="round" />
        {series.length > 1 && (
          <path
            d={`M${x(Math.max(0, series.length - 60))},${y(series[series.length - 60].v)}`}
            fill="none"
            stroke="transparent"
          />
        )}
        <text x={pad.l} y={height - 4} className="axis-label">
          {fmtShortDate(series[0].t)}
        </text>
        <text x={pad.l + innerW} y={height - 4} className="axis-label" textAnchor="end">
          {fmtShortDate(last.t)}
        </text>
      </svg>
    </div>
  );
}
