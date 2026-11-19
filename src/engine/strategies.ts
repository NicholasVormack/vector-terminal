import type { Bar } from '../types';
import {
  bollinger,
  closes,
  donchian,
  highs,
  lows,
  macd,
  roc,
  rsi,
  sma,
  zscore,
  type Series,
} from './indicators';

export interface ParamDef {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  /** two-element range used by the parameter sweep */
  sweep?: [number, number];
  hint?: string;
}

export interface StrategyCtx {
  i: number;
  bar: Bar;
  bars: Bar[];
  close: number[];
  position: number;
  equity: number;
}

/** Returns the desired exposure in [-1, 1], or null for "no opinion". */
export type StrategyFn = (ctx: StrategyCtx) => number | null;

export interface Strategy {
  id: string;
  name: string;
  family: 'Trend' | 'Mean reversion' | 'Momentum' | 'Benchmark';
  blurb: string;
  params: ParamDef[];
  make(params: Record<string, number>, bars: Bar[]): StrategyFn;
}

const at = (s: Series, i: number) => s[i];
const num = (v: number | null | undefined, fallback = NaN) => (v === null || v === undefined ? fallback : v);

function crossState(fast: Series, slow: Series, i: number): number {
  const f = at(fast, i);
  const s = at(slow, i);
  if (f === null || s === null) return 0;
  if (f === s) return 0;
  return f > s ? 1 : -1;
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'sma-cross',
    name: 'Moving average crossover',
    family: 'Trend',
    blurb:
      'Classic golden/death cross. Long when the fast SMA trades above the slow SMA, flat otherwise (short when shorting is enabled).',
    params: [
      { key: 'fast', label: 'Fast SMA', value: 20, min: 3, max: 100, step: 1, integer: true, sweep: [8, 32] },
      { key: 'slow', label: 'Slow SMA', value: 100, min: 20, max: 300, step: 5, integer: true, sweep: [60, 200] },
    ],
    make(p, bars) {
      const c = closes(bars);
      const fast = sma(c, Math.round(p.fast));
      const slow = sma(c, Math.round(p.slow));
      return ({ i }) => {
        const state = crossState(fast, slow, i);
        if (state === 0 && at(fast, i) === null) return null;
        return state;
      };
    },
  },
  {
    id: 'donchian',
    name: 'Donchian breakout',
    family: 'Trend',
    blurb:
      'Turtle-style channel breakout. Enters on a close above the prior N-day high and exits on a close below the prior M-day low.',
    params: [
      { key: 'entry', label: 'Entry lookback', value: 55, min: 10, max: 120, step: 5, integer: true, sweep: [20, 100] },
      { key: 'exit', label: 'Exit lookback', value: 20, min: 5, max: 60, step: 5, integer: true, sweep: [10, 40] },
    ],
    make(p, bars) {
      const c = closes(bars);
      const h = highs(bars);
      const l = lows(bars);
      const entryCh = donchian(h, l, Math.round(p.entry));
      const exitCh = donchian(h, l, Math.round(p.exit));
      let holding = 0;
      return ({ i }) => {
        const up = at(entryCh.upper, i);
        const down = at(exitCh.lower, i);
        if (up === null || down === null) return null;
        if (!holding && c[i] > (up as number)) holding = 1;
        else if (holding && c[i] < (down as number)) holding = 0;
        return holding;
      };
    },
  },
  {
    id: 'rsi-reversion',
    name: 'RSI mean reversion',
    family: 'Mean reversion',
    blurb:
      'Buys oversold exhaustion and exits on the snap back to neutral. A staple of short-horizon equity stat-arb desks.',
    params: [
      { key: 'period', label: 'RSI period', value: 14, min: 4, max: 40, step: 1, integer: true, sweep: [6, 24] },
      { key: 'entry', label: 'Entry level', value: 30, min: 10, max: 45, step: 1, sweep: [20, 40] },
      { key: 'exit', label: 'Exit level', value: 55, min: 40, max: 80, step: 1 },
    ],
    make(p, bars) {
      const r = rsi(closes(bars), Math.round(p.period));
      let holding = 0;
      return ({ i }) => {
        const v = at(r, i);
        if (v === null) return null;
        if (!holding && v < p.entry) holding = 1;
        else if (holding && v > p.exit) holding = 0;
        return holding;
      };
    },
  },
  {
    id: 'macd',
    name: 'MACD trend',
    family: 'Trend',
    blurb:
      'Momentum-of-momentum. Long while the MACD line sits above its signal line, flipping short on the cross down when enabled.',
    params: [
      { key: 'fast', label: 'Fast EMA', value: 12, min: 3, max: 40, step: 1, integer: true, sweep: [6, 20] },
      { key: 'slow', label: 'Slow EMA', value: 26, min: 10, max: 80, step: 2, integer: true, sweep: [18, 46] },
      { key: 'signal', label: 'Signal EMA', value: 9, min: 3, max: 20, step: 1, integer: true },
    ],
    make(p, bars) {
      const m = macd(closes(bars), Math.round(p.fast), Math.round(p.slow), Math.round(p.signal));
      return ({ i }) => {
        if (num(at(m.macd, i)) === 0 && at(m.macd, i) === null) return null;
        const state = crossState(m.macd, m.signal, i);
        return state;
      };
    },
  },
  {
    id: 'bollinger-rev',
    name: 'Bollinger z-score reversion',
    family: 'Mean reversion',
    blurb:
      'Fades statistically stretched moves: buys when price is N standard deviations below its rolling mean, exits at the mean.',
    params: [
      { key: 'period', label: 'Lookback', value: 20, min: 5, max: 100, step: 1, integer: true, sweep: [10, 60] },
      { key: 'entry', label: 'Entry z', value: 2, min: 0.5, max: 4, step: 0.25, sweep: [1.25, 3] },
      { key: 'exit', label: 'Exit z', value: 0, min: -1, max: 1.5, step: 0.25 },
    ],
    make(p, bars) {
      const c = closes(bars);
      const z = zscore(c, Math.round(p.period));
      const bb = bollinger(c, Math.round(p.period), 2);
      let holding = 0;
      return ({ i }) => {
        const v = at(z, i);
        if (v === null || at(bb.mid, i) === null) return null;
        if (!holding && v < -p.entry) holding = 1;
        else if (holding && v > p.exit) holding = 0;
        return holding;
      };
    },
  },
  {
    id: 'momentum',
    name: 'Time-series momentum',
    family: 'Momentum',
    blurb:
      'The academic workhorse: go long when trailing return over the lookback exceeds a threshold, exit when it decays through the trend filter.',
    params: [
      { key: 'lookback', label: 'Lookback (days)', value: 126, min: 20, max: 252, step: 5, integer: true, sweep: [60, 210] },
      { key: 'threshold', label: 'Entry return', value: 0.05, min: 0, max: 0.3, step: 0.01, sweep: [0, 0.2] },
      { key: 'filter', label: 'Trend SMA', value: 100, min: 20, max: 250, step: 5, integer: true },
    ],
    make(p, bars) {
      const c = closes(bars);
      const r = roc(c, Math.round(p.lookback));
      const trend = sma(c, Math.round(p.filter));
      return ({ i }) => {
        const v = at(r, i);
        const t = at(trend, i);
        if (v === null || t === null) return null;
        return v > p.threshold && c[i] > t ? 1 : 0;
      };
    },
  },
  {
    id: 'buy-hold',
    name: 'Buy & hold',
    family: 'Benchmark',
    blurb: 'Fully invested from the first tradable bar. Useful as a sanity check on every other strategy.',
    params: [],
    make(_p, bars) {
      return ({ i }) => (i === 0 ? 1 : null);
    },
  },
];

export const byId = new Map(STRATEGIES.map((s) => [s.id, s]));

export function defaultParams(s: Strategy): Record<string, number> {
  const o: Record<string, number> = {};
  for (const p of s.params) o[p.key] = p.value;
  return o;
}
