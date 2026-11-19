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

export function zscore(values: number[], n = 20): Series {
  const mid = sma(values, n);
  const sd = rollingStd(values, n);
  return values.map((v, i) => (mid[i] === null || !sd[i] ? null : (v - (mid[i] as number)) / (sd[i] as number)));
}

/** Highest high of the n bars strictly before i — no lookahead. */
export function priorHigh(highs: number[], n: number): Series {
  const out: Series = new Array(highs.length).fill(null);
  for (let i = n; i < highs.length; i++) {
    let hi = -Infinity;
    for (let j = i - n; j < i; j++) if (highs[j] > hi) hi = highs[j];
    out[i] = hi;
  }
  return out;
}

export const closes = (bars: { c: number }[]) => bars.map((b) => b.c);
export const highs = (bars: { h: number }[]) => bars.map((b) => b.h);
