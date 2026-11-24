import type { Bar, Item, MarketLoad } from '../types';

/**
 * Crypto, from CoinGecko.
 *
 * The free tier allows roughly five calls a minute, which rules out fetching a
 * panel of coins live on every load: the first real run of the snapshot script got
 * four coins and ten 429s. So the daily series ships as a snapshot and only two
 * things ever hit the network at runtime — one bulk quote call for the whole panel,
 * and one history call for the coin you just selected. Both fail soft.
 */
interface CoinRow {
  id: number;
  slug: string;
  symbol: string;
  name: string;
  quote: { price: number; chg24: number | null; volume: number | null; mcap: number | null };
  rows: [number, number, number][];
}

interface CryptoSnapshot {
  asOf: number;
  coins: CoinRow[];
}

const BASE = import.meta.env.BASE_URL;
const SNAPSHOT_URL = `${BASE}crypto-snapshot.json`;
const MARKETS_URL =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&price_change_percentage=24h&ids=';
const CHART_URL = 'https://api.coingecko.com/api/v3/coins/';

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

export interface CryptoLoad extends MarketLoad {
  /** CoinGecko ids stay attached so a refresh knows what to ask for. */
  slugById: Map<number, string>;
}

export async function loadCrypto(): Promise<CryptoLoad> {
  const res = await fetch(SNAPSHOT_URL);
  if (!res.ok) throw new Error(`crypto snapshot HTTP ${res.status}`);
  const raw = (await res.json()) as CryptoSnapshot;
  const slugById = new Map<number, string>();
  // The snapshot has shipped two coins on the same id, which makes one of them
  // unselectable and gives React duplicate keys, so duplicates get the next free
  // number. Highest id wins the range, so a renumber can never collide again.
  const used = new Set<number>();
  let next = raw.coins.reduce((m, c) => Math.max(m, c.id), 0) + 1;

  const items: Item[] = raw.coins.map((c) => {
    let id = c.id;
    if (used.has(id)) id = next++;
    used.add(id);
    slugById.set(id, c.slug);
    // A daily close sequence has no intraday range, so each candle opens where the
    // last one closed and carries no wick: a line wearing a candle's clothes, which
    // is the honest rendering of the data the free tier gives.
    const bars: Bar[] = c.rows.map(([t, p, v], i) => ({
      t,
      o: i > 0 ? c.rows[i - 1][1] : p,
      h: p,
      l: p,
      c: p,
      v: v ?? 0,
    }));
    const last = bars[bars.length - 1];
    return {
      meta: {
        id,
        name: `${c.name} (${c.symbol})`,
        limit: 0,
        members: false,
        examine: `Spot ${c.symbol} against USD. Buy limits do not exist here, so size is capped by capital alone.`,
      },
      bars,
      quote: last ? { ask: last.c, bid: last.c, t: last.t } : null,
    };
  });

  return { items, source: 'snapshot', asOf: raw.asOf, slugById };
}

/** One bulk call for the whole panel. Returns a slug -> quote map, or null. */
export async function fetchQuotes(slugs: string[]): Promise<Map<string, number> | null> {
  try {
    const raw = (await getJson(`${MARKETS_URL}${slugs.join(',')}`, 8000)) as {
      id: string;
      current_price: number;
    }[];
    if (!Array.isArray(raw)) return null;
    return new Map(raw.map((c) => [c.id, c.current_price]));
  } catch {
    return null;
  }
}

/** Newer daily closes for one coin, or null when the tier says no. */
export async function refreshCryptoSeries(slug: string): Promise<Bar[] | null> {
  try {
    const raw = (await getJson(
      `${CHART_URL}${slug}/market_chart?vs_currency=usd&days=365&interval=daily`,
      9000,
    )) as { prices: [number, number][] };
    if (!Array.isArray(raw?.prices)) return null;
    const bars: Bar[] = [];
    for (const [t, p] of raw.prices) {
      if (!Number.isFinite(p) || p <= 0) continue;
      const open = bars.length ? bars[bars.length - 1].c : p;
      bars.push({ t, o: open, h: Math.max(open, p), l: Math.min(open, p), c: p, v: 0 });
    }
    return bars.length >= 60 ? bars : null;
  } catch {
    return null;
  }
}
