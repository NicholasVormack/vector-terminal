export type Series = (number | null)[];

export function sma(values: number[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(values: number[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < n) return out;
  const k = 2 / (n + 1);
  let seed = 0;
  for (let i = 0; i < n; i++) seed += values[i];
  let prev = seed / n;
  out[n - 1] = prev;
  for (let i = n; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], n = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / n;
  let avgLoss = loss / n;
  out[n] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (n - 1) + Math.max(0, d)) / n;
    avgLoss = (avgLoss * (n - 1) + Math.max(0, -d)) / n;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function trueRange(high: number[], low: number[], close: number[]): number[] {
  const out = new Array(high.length).fill(0);
  for (let i = 0; i < high.length; i++) {
    if (i === 0) {
      out[i] = high[i] - low[i];
      continue;
    }
    out[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }
  return out;
}

export function atr(high: number[], low: number[], close: number[], n = 14): Series {
  const tr = trueRange(high, low, close);
  const out: Series = new Array(tr.length).fill(null);
  if (tr.length < n) return out;
  let seed = 0;
  for (let i = 0; i < n; i++) seed += tr[i];
  let prev = seed / n;
  out[n - 1] = prev;
  for (let i = n; i < tr.length; i++) {
    prev = (prev * (n - 1) + tr[i]) / n;
    out[i] = prev;
  }
  return out;
}

export function rollingStd(values: number[], n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    sumSq += values[i] * values[i];
    if (i >= n) {
      sum -= values[i - n];
      sumSq -= values[i - n] * values[i - n];
    }
    if (i >= n - 1) {
      const mean = sum / n;
      out[i] = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    }
  }
  return out;
}

export interface Bands {
  mid: Series;
  upper: Series;
  lower: Series;
}

export function bollinger(values: number[], n = 20, k = 2): Bands {
  const mid = sma(values, n);
  const sd = rollingStd(values, n);
  const upper: Series = mid.map((m, i) => (m === null || sd[i] === null ? null : m + k * (sd[i] as number)));
  const lower: Series = mid.map((m, i) => (m === null || sd[i] === null ? null : m - k * (sd[i] as number)));
  return { mid, upper, lower };
}

export interface Macd {
  macd: Series;
  signal: Series;
  hist: Series;
}

export function macd(values: number[], fast = 12, slow = 26, signalN = 9): Macd {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] === null || s[i] === null ? null : (f[i] as number) - (s[i] as number)));
  const compact = line.map((v) => v ?? 0);
  const sig = ema(compact, signalN);
  const outSignal: Series = line.map((v, i) => (v === null || sig[i] === null ? null : sig[i]));
  const hist: Series = line.map((v, i) => (v === null || outSignal[i] === null ? null : v - (outSignal[i] as number)));
  return { macd: line, signal: outSignal, hist };
}

export function roc(values: number[], n: number): Series {
  return values.map((v, i) => (i < n || values[i - n] === 0 ? null : v / values[i - n] - 1));
}

/** Donchian channel computed from bars strictly before i (no lookahead). */
export function donchian(high: number[], low: number[], n: number) {
  const upper: Series = new Array(high.length).fill(null);
  const lower: Series = new Array(low.length).fill(null);
  for (let i = n; i < high.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - n; j < i; j++) {
      if (high[j] > hi) hi = high[j];
      if (low[j] < lo) lo = low[j];
    }
    upper[i] = hi;
    lower[i] = lo;
  }
  return { upper, lower };
}

export function zscore(values: number[], n = 20): Series {
  const mid = sma(values, n);
  const sd = rollingStd(values, n);
  return values.map((v, i) => (mid[i] === null || !sd[i] ? null : (v - (mid[i] as number)) / (sd[i] as number)));
}

export const closes = (bars: { c: number }[]) => bars.map((b) => b.c);
export const highs = (bars: { h: number }[]) => bars.map((b) => b.h);
export const lows = (bars: { l: number }[]) => bars.map((b) => b.l);
export const volumes = (bars: { v: number }[]) => bars.map((b) => b.v);
