import type { Bar, Instrument } from '../types';
import { getSeries } from './simulator';

export type SourceId = 'sim' | 'twelvedata';

export const KEY_STORAGE = 'vector.twelvedata.key';

export function getStoredKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setStoredKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Twelve Data daily bars. The endpoint returns CORS headers, so it can be
 * called straight from the browser with the user's own key. Free tier is
 * roughly 800 credits/day — one credit per time-series request.
 */
async function fetchTwelveData(symbol: string, apiKey: string): Promise<Bar[]> {
  const url =
    'https://api.twelvedata.com/time_series?symbol=' +
    encodeURIComponent(symbol) +
    '&interval=1day&outputsize=1500&order=ASC&format=JSON&apikey=' +
    encodeURIComponent(apiKey);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from Twelve Data`);
  const json: any = await res.json();
  if (json.status === 'error' || json.code) {
    throw new Error(json.message || 'Twelve Data rejected the request');
  }
  const values: any[] = json.values ?? [];
  if (!values.length) throw new Error('No rows returned for this symbol');

  const bars: Bar[] = [];
  for (const row of values) {
    const t = Date.parse(row.datetime + 'T00:00:00Z');
    const o = Number(row.open);
    const h = Number(row.high);
    const l = Number(row.low);
    const c = Number(row.close);
    if (![t, o, h, l, c].every(Number.isFinite)) continue;
    bars.push({ t, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: Number(row.volume) || 0 });
  }
  bars.sort((a, b) => a.t - b.t);
  return bars;
}

export interface LoadResult {
  bars: Bar[];
  label: string;
  note: string;
}

export async function loadBars(inst: Instrument, source: SourceId, key: string): Promise<LoadResult> {
  if (source === 'twelvedata') {
    if (!key) throw new Error('Add a Twelve Data API key to pull live bars.');
    const bars = await fetchTwelveData(inst.symbol, key);
    if (bars.length < 60) throw new Error(`Only ${bars.length} bars returned — need at least 60 to backtest.`);
    return {
      bars,
      label: 'Twelve Data · live',
      note: `${bars.length} adjusted daily bars · free tier 800 credits/day`,
    };
  }
  const bars = getSeries(inst);
  return {
    bars,
    label: 'Simulated feed',
    note: `${bars.length} synthetic sessions · regime-switching GBM with fat tails`,
  };
}
