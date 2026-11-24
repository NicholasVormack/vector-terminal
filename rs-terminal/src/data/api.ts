import type { Bar, Item, MarketLoad } from '../types';

interface SnapItem {
  id: number;
  name: string;
  limit: number;
  members: boolean;
  examine: string;
  /** [timestamp, avgHigh, avgLow, highVol, lowVol] */
  rows: number[][];
}

interface Snapshot {
  asOf: number;
  items: SnapItem[];
}

interface LatestResponse {
  data: Record<string, { high: number | null; low: number | null; highTime: number; lowTime: number }>;
}

interface SeriesResponse {
  data: {
    timestamp: number;
    avgHighPrice: number | null;
    avgLowPrice: number | null;
    highPriceVolume: number;
    lowPriceVolume: number;
  }[];
}

const BASE = import.meta.env.BASE_URL;
const SNAPSHOT_URL = `${BASE}rs-snapshot.json`;
const LATEST_URL = 'https://prices.runescape.wiki/api/v1/osrs/latest';
const SERIES_URL = 'https://prices.runescape.wiki/api/v1/osrs/timeseries?timestep=24h&id=';

async function getJson(url: string, ms: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A day of GE data is an average instant-buy price (the ask) and an average
 * instant-sell price (the bid). The candle body is the mid, the wick is the
 * spread that day actually traded at.
 */
export function toBars(rows: number[][]): Bar[] {
  const bars: Bar[] = [];
  for (const row of rows) {
    const [t, high, low, highVol, lowVol] = row;
    if (!t || !high || !low) continue;
    const mid = Math.round((high + low) / 2);
    const open = bars.length ? bars[bars.length - 1].c : mid;
    bars.push({
      t: t * 1000,
      o: open,
      h: Math.max(high, open, mid),
      l: Math.min(low, open, mid),
      c: mid,
      v: (highVol ?? 0) + (lowVol ?? 0),
    });
  }
  return bars;
}

export async function loadMarket(): Promise<MarketLoad> {
  const raw = (await getJson(SNAPSHOT_URL, 10_000)) as Snapshot;
  const items: Item[] = raw.items.map((it) => ({
    meta: { id: it.id, name: it.name, limit: it.limit, members: it.members, examine: it.examine },
    bars: toBars(it.rows),
    quote: null,
  }));

  try {
    const live = (await getJson(LATEST_URL, 6000)) as LatestResponse;
    let merged = 0;
    for (const item of items) {
      const q = live.data?.[String(item.meta.id)];
      if (q?.high && q?.low) {
        item.quote = { ask: q.high, bid: q.low, t: Math.max(q.highTime, q.lowTime) * 1000 };
        merged += 1;
      }
    }
    if (merged > 0) return { items, source: 'live', asOf: raw.asOf };
  } catch {
    // Offline, blocked or rate-limited: the bundled snapshot is the fallback.
  }

  return { items, source: 'snapshot', asOf: raw.asOf };
}

/** Newer daily bars for one item, or null when the feed is unavailable. */
export async function refreshSeries(id: number): Promise<Bar[] | null> {
  try {
    const raw = (await getJson(`${SERIES_URL}${id}`, 8000)) as SeriesResponse;
    if (!Array.isArray(raw.data)) return null;
    const rows = raw.data
      .filter((r) => r.avgHighPrice && r.avgLowPrice)
      .map((r) => [
        r.timestamp,
        r.avgHighPrice as number,
        r.avgLowPrice as number,
        r.highPriceVolume,
        r.lowPriceVolume,
      ]);
    const bars = toBars(rows);
    return bars.length >= 60 ? bars : null;
  } catch {
    return null;
  }
}
