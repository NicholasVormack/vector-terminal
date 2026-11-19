import type { Bar } from '../types';
import { closes, highs, priorHigh, sma, zscore } from './indicators';

/** 1 = want to be long, -1 = want to be flat, 0 = no change. */
export type Signal = -1 | 0 | 1;

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
}

export interface Strategy {
  id: string;
  name: string;
  blurb: string;
  params: ParamDef[];
  /** Signal at index i is decided on bar i's close and filled on bar i+1. */
  signals: (bars: Bar[], p: Record<string, number>) => Signal[];
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'sma-cross',
    name: 'SMA crossover',
    blurb:
      'Long while the fast average sits above the slow one. The slowest way to trade an item, and the closest thing here to buy-and-hold.',
    params: [
      { key: 'fast', label: 'Fast SMA', min: 3, max: 60, step: 1, def: 20 },
      { key: 'slow', label: 'Slow SMA', min: 10, max: 200, step: 1, def: 50 },
    ],
    signals: (bars, p) => {
      const c = closes(bars);
      const fast = sma(c, Math.round(p.fast));
      const slow = sma(c, Math.round(p.slow));
      return c.map((_, i) => {
        const f = fast[i];
        const s = slow[i];
        if (f === null || s === null) return 0;
        return f > s ? 1 : -1;
      });
    },
  },
  {
    id: 'breakout',
    name: 'Channel breakout',
    blurb:
      'Buy a close above the prior n-day high, exit on a close back under the n-day mean. Trades rarely, and only when the market has already moved.',
    params: [{ key: 'lookback', label: 'Lookback', min: 5, max: 90, step: 1, def: 20 }],
    signals: (bars, p) => {
      const n = Math.round(p.lookback);
      const c = closes(bars);
      const top = priorHigh(highs(bars), n);
      const mean = sma(c, n);
      return c.map((v, i) => {
        if (top[i] !== null && v > (top[i] as number)) return 1;
        if (mean[i] !== null && v < (mean[i] as number)) return -1;
        return 0;
      });
    },
  },
  {
    id: 'mean-revert',
    name: 'Mean reversion',
    blurb:
      'Buy when the mid is k standard deviations under its n-day mean, exit when it is back at the mean. The classic answer to a market that overshoots.',
    params: [
      { key: 'window', label: 'Window', min: 5, max: 60, step: 1, def: 20 },
      { key: 'entry', label: 'Entry z', min: 0.5, max: 3, step: 0.1, def: 1 },
    ],
    signals: (bars, p) => {
      const z = zscore(closes(bars), Math.round(p.window));
      return z.map((v) => {
        if (v === null) return 0;
        if (v < -p.entry) return 1;
        if (v > 0) return -1;
        return 0;
      });
    },
  },
  {
    id: 'momentum',
    name: 'Momentum',
    blurb:
      'Long while the n-day return beats a threshold, flat when it turns negative. On a taxed market this is mostly a turnover generator.',
    params: [
      { key: 'lookback', label: 'Lookback', min: 3, max: 60, step: 1, def: 10 },
      { key: 'threshold', label: 'Threshold %', min: 0, max: 10, step: 0.5, def: 2 },
    ],
    signals: (bars, p) => {
      const n = Math.round(p.lookback);
      const c = closes(bars);
      return c.map((v, i) => {
        if (i < n || c[i - n] === 0) return 0;
        const r = v / c[i - n] - 1;
        if (r > p.threshold / 100) return 1;
        if (r < 0) return -1;
        return 0;
      });
    },
  },
];

export const strategyById = (id: string) => STRATEGIES.find((s) => s.id === id) ?? STRATEGIES[0];

export const defaultParams = (s: Strategy) =>
  Object.fromEntries(s.params.map((p) => [p.key, p.def])) as Record<string, number>;
