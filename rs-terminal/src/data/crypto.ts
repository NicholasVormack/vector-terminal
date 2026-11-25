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

const DAY_MS = 86_400_000;

/**
 * A daily close sequence into bars.
 *
 * CoinGecko's daily series is one price per day: there is no published high, low or
 * session, so each candle opens at the previous close and carries no wick. That is a
 * line wearing a candle's clothes, which is the honest rendering of the feed.
 *
 * Both the bundled snapshot and the runtime refresh build bars here on purpose. They
 * used to differ — the refresh derived a high and a low from open→close — and the
 * engine reads `h` as the ask and `l` as the bid (see runBacktest), so the refreshed
 * series bought every entry at the day's high and sold every exit at its low: a spread
 * this venue does not have. Same data, two shapes, 14 points of return apart on BTC.
 *
 * Only completed days survive. The payload ends with a point at "now", which is today
 * in progress: it answers differently on every request, so a backtest over it cannot be
 * reproduced, and it is not a close anybody could have traded at. Settled closes are the
 * ones stamped at a UTC day boundary; the unfinished day is dropped here and lives in
 * the header as the live quote instead.
 */
function barsFrom(rows: [number, number, number?][]): Bar[] {
  const bars: Bar[] = [];
  for (const [t, p, v] of rows) {
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(t)) continue;
    if (t % DAY_MS !== 0) continue;
    const open = bars.length ? bars[bars.length - 1].c : p;
    bars.push({ t, o: open, h: p, l: p, c: p, v: v ?? 0 });
  }
  return bars;
}

/**
 * Change since the last settled close.
 *
 * The series stops on the final completed UTC day, so the only honest "today" figure is
 * a live quote measured against that close. With no quote the newest settled day is the
 * last move there is, and it is a day-over-day change.
 */
export function changeSinceSettledClose(bars: Bar[], livePrice: number | null): number | null {
  if (bars.length < 2) return null;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  if (livePrice != null && livePrice > 0) return livePrice / last.c - 1;
  return prev.c > 0 ? last.c / prev.c - 1 : null;
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
    const bars = barsFrom(c.rows);
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

  // Derive the date from the bars rather than the file: the series ends on a settled
  // close now, and a snapshot written mid-day carries an asOf a day later than that.
  const lastT = items.reduce((m, it) => Math.max(m, it.bars[it.bars.length - 1]?.t ?? 0), 0);

  return { items, source: 'snapshot', asOf: lastT || raw.asOf, slugById };
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
    )) as { prices: [number, number][]; total_volumes?: [number, number][] };
    if (!Array.isArray(raw?.prices)) return null;
    // Volume rides along in the same payload, and the snapshot carries it, so dropping
    // it here would blank the volume readout the moment a refresh lands.
    const volumes = new Map((raw.total_volumes ?? []).map(([t, v]) => [t, v]));
    const bars = barsFrom(raw.prices.map(([t, p]) => [t, p, volumes.get(t)]));
    return bars.length >= 60 ? bars : null;
  } catch {
    return null;
  }
}
