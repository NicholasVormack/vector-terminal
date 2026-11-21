import type { Bar, Item } from '../types';

/**
 * RS3, from Jagex's own itemdb.
 *
 * Three things make this a snapshot and not a live feed:
 *   - the endpoint sends no CORS header, so a browser on GitHub Pages cannot read it;
 *   - it publishes one price per day, not a bid and an ask;
 *   - there is no volume field at all.
 *
 * So `scripts/snapshot.mjs` pulls 180 daily prices per item at build time and this
 * module reads that file. Because there is one price, open is the previous close
 * and the candle has no body to speak of; h and l collapse onto it deliberately
 * rather than inventing a spread the venue never quoted.
 */
interface Rs3Item {
  id: number;
  name: string;
  limit: number;
  members: boolean;
  examine: string;
  rows: [number, number][];
}

interface Rs3Snapshot {
  asOf: number;
  items: Rs3Item[];
}

const URL = `${import.meta.env.BASE_URL}rs3-snapshot.json`;

export interface MarketLoad {
  items: Item[];
  source: 'snapshot' | 'live';
  asOf: number;
}

export function closeBars(rows: [number, number][]): Bar[] {
  const bars: Bar[] = [];
  for (const [t, p] of rows) {
    if (!Number.isFinite(t) || !Number.isFinite(p) || p <= 0) continue;
    const open = bars.length ? bars[bars.length - 1].c : p;
    bars.push({ t, o: open, h: Math.max(open, p), l: Math.min(open, p), c: p, v: 0 });
  }
  return bars;
}

export async function loadRs3(): Promise<MarketLoad> {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`RS3 snapshot HTTP ${res.status}`);
  const raw = (await res.json()) as Rs3Snapshot;
  const items: Item[] = raw.items.map((it) => {
    const bars = closeBars(it.rows);
    const last = bars[bars.length - 1];
    return {
      meta: { id: it.id, name: it.name, limit: it.limit, members: it.members, examine: it.examine },
      bars,
      // One published price, so bid and ask are the same number and the spread the
      // UI shows is honestly zero rather than a placeholder.
      quote: last ? { ask: last.c, bid: last.c, t: last.t } : null,
    };
  });
  return { items, source: 'snapshot', asOf: raw.asOf };
}
