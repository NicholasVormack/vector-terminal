import type { Bar, Instrument } from '../types';

/** Last simulated session: Friday 13 November 2026. */
export const ANCHOR = Date.UTC(2026, 10, 13);
export const SERIES_LENGTH = 900;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSymbol(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tradingDays(end: number, count: number): number[] {
  const out: number[] = [];
  let t = end;
  while (out.length < count) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) out.push(t);
    t -= 86_400_000;
  }
  return out.reverse();
}

/**
 * Deterministic market simulator.
 *
 * Three regimes (expansion / drawdown / chop) follow a Markov chain, an AR(1)
 * momentum term adds trend persistence, and occasional jumps fatten the tails.
 * The finished log-price path is rescaled so the last close equals the
 * instrument's reference price, which keeps the price axis plausible.
 */
export function generateSeries(inst: Instrument, length = SERIES_LENGTH): Bar[] {
  const rnd = mulberry32(hashSymbol(inst.symbol));
  const days = tradingDays(ANCHOR, length);
  const n = days.length;
  const dailyVol = inst.vol / Math.sqrt(252);

  const drift = [0.24, -0.2, 0.03];
  const volMult = [0.85, 1.5, 0.72];
  const trans = [
    [0.975, 0.011, 0.014],
    [0.018, 0.958, 0.024],
    [0.028, 0.016, 0.956],
  ];

  let regime = rnd() < 0.55 ? 0 : 2;
  let momentum = 0;
  let level = 0;
  const closes: number[] = [1];
  const rets: number[] = [0];
  const volMultHist: number[] = [volMult[regime]];

  for (let i = 1; i < n; i++) {
    const u = rnd();
    let cumulative = 0;
    for (let r = 0; r < 3; r++) {
      cumulative += trans[regime][r];
      if (u < cumulative) {
        regime = r;
        break;
      }
    }
    momentum = 0.965 * momentum + (rnd() + rnd() + rnd() - 1.5) * 0.55;

    const z = (rnd() + rnd() + rnd() + rnd() + rnd() + rnd() - 3) / Math.sqrt(0.5);
    const jump = rnd() < 0.022 ? (rnd() < 0.45 ? -1 : 1) * (3 + rnd() * 4) : 1;
    const ret = (drift[regime] + momentum * 0.13) / 252 + dailyVol * volMult[regime] * z * jump;
    level += Math.max(-0.35, Math.min(0.35, ret));
    closes.push(Math.exp(level));
    rets.push(ret);
    volMultHist.push(volMult[regime]);
  }

  const sf = inst.price / closes[n - 1];
  const baseVol = inst.sharesOut * 0.0075;
  const bars: Bar[] = [];

  for (let i = 0; i < n; i++) {
    const c = closes[i] * sf;
    const prev = i > 0 ? closes[i - 1] * sf : c / (1 + rets[0] || 1);
    const sigma = dailyVol * volMultHist[i];
    const gapZ = (rnd() + rnd() - 1) * 1.2;
    const o = prev * (1 + sigma * 0.35 * gapZ);
    const bodyHigh = Math.max(o, c);
    const bodyLow = Math.min(o, c);
    const hi = bodyHigh * (1 + Math.abs(rnd() + rnd() - 1) * sigma * 0.75);
    const lo = bodyLow * (1 - Math.abs(rnd() + rnd() - 1) * sigma * 0.75);
    const volNoise = 0.55 + rnd() * 1.1 + Math.abs(rets[i]) / Math.max(1e-6, sigma) * 0.55;
    const v = baseVol * volNoise * (1 + i / n * 0.35);

    const round = (x: number) => Math.max(0.01, Math.round(x * 100) / 100);
    const bar: Bar = {
      t: days[i],
      o: round(o),
      h: round(Math.max(hi, bodyHigh)),
      l: round(Math.min(lo, bodyLow)),
      c: round(c),
      v: Math.round(v),
    };
    if (bar.h < bar.c) bar.h = bar.c;
    if (bar.l > bar.c) bar.l = bar.c;
    if (bar.h < bar.o) bar.h = bar.o;
    if (bar.l > bar.o) bar.l = bar.o;
    bars.push(bar);
  }
  return bars;
}

const cache = new Map<string, Bar[]>();

export function getSeries(inst: Instrument): Bar[] {
  const hit = cache.get(inst.symbol);
  if (hit) return hit;
  const bars = generateSeries(inst);
  cache.set(inst.symbol, bars);
  return bars;
}
