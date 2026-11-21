import type { Item } from '../types';
import { useCallback, useEffect, useState } from 'react';

/**
 * The master list.
 *
 * Three kinds of row live here and the table says which is which, because a number
 * with an unknown provenance is worse than no number:
 *
 *   live      crypto quotes, NFT floors, OSRS and RS3 prices, each refreshed from
 *             the venue that owns the price
 *   reference the two gold rates, which are inputs rather than quotes
 *   manual    physical cards, toys and marketplace gold. There is no free,
 *             licensed feed for any of these — TCGplayer and eBay both gate theirs
 *             behind credentials, and Eldorado has no public buyer API at all — so
 *             these rows start empty and are priced by whoever is watching them.
 */
export type Category = 'crypto' | 'nft' | 'osrs' | 'rs3' | 'rmt' | 'cards' | 'toys';

export interface CategoryDef {
  id: Category;
  label: string;
  blurb: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'osrs', label: 'OSRS', blurb: 'Old School GE, marked at the mid and converted with your rate.' },
  { id: 'rs3', label: 'RS3', blurb: 'Jagex itemdb, one price per day.' },
  { id: 'crypto', label: 'Crypto', blurb: 'CoinGecko spot against USD, 24h change.' },
  { id: 'nft', label: 'NFT', blurb: 'Collection floor in ETH and USD, from CoinGecko NFT.' },
  { id: 'rmt', label: 'Game currency', blurb: 'Gold per million, priced by you from the marketplaces you use.' },
  { id: 'cards', label: 'Cards', blurb: 'Graded Pokémon and sports cards. No free licensed feed exists; these are your marks.' },
  { id: 'toys', label: 'Toys', blurb: 'Littlest Pet Shop, Beanie Babies and the rest of the shelf.' },
];

export interface ManualEntry {
  usd: number;
  asOf: number;
}

export interface MasterRow {
  id: string;
  category: Category;
  name: string;
  detail: string;
  /** gp rows are converted to dollars at render time; usd rows already are dollars. */
  priceKind: 'gp' | 'usd';
  native: number | null;
  unit: string;
  chg24: number | null;
  chg7: number | null;
  chg30: number | null;
  source: string;
  live: boolean;
  asOf: number | null;
  manual: boolean;
  /** A second quote in the venue's own unit: the ETH floor behind a dollar figure. */
  alt?: number | null;
  altUnit?: string;
}

interface Seed {
  id: string;
  name: string;
  detail: string;
  unit: string;
}

/** Rows with no public price feed. Empty until somebody who owns the object prices them. */
const RMT_SEED: Seed[] = [
  { id: 'rmt-osrs-gold', name: 'OSRS gold', detail: 'Old School, bulk listings', unit: 'per 1M gp' },
  { id: 'rmt-rs3-gold', name: 'RS3 gold', detail: 'RuneScape 3, bulk listings', unit: 'per 1M gp' },
  { id: 'rmt-osrs-bond', name: 'OSRS bond', detail: 'Jagex, official — the only sanctioned gp↔USD bridge', unit: 'per bond' },
  { id: 'rmt-wow-gold', name: 'WoW gold', detail: 'Retail, per-server listings', unit: 'per 10k gold' },
  { id: 'rmt-ffxiv-gil', name: 'FFXIV gil', detail: 'Per data centre', unit: 'per 1M gil' },
  { id: 'rmt-poe-chaos', name: 'Path of Exile chaos', detail: 'League economy', unit: 'per 100 chaos' },
];

const CARD_SEED: Seed[] = [
  { id: 'card-charizard-base', name: 'Charizard, Base Set 1st ed.', detail: 'Pokémon · PSA 9', unit: 'per card' },
  { id: 'card-umbreon-skyridge', name: 'Umbreon, Skyridge holo', detail: 'Pokémon · PSA 10', unit: 'per card' },
  { id: 'card-umbreon-vmax', name: 'Umbreon VMAX alt art', detail: 'Pokémon · Evolving Skies, PSA 10', unit: 'per card' },
  { id: 'card-lugia-neo', name: 'Lugia, Neo Genesis 1st ed.', detail: 'Pokémon · PSA 9', unit: 'per card' },
  { id: 'card-jordan-fleer', name: 'Michael Jordan #57', detail: 'Basketball · 1986 Fleer, PSA 8', unit: 'per card' },
  { id: 'card-brady-contenders', name: 'Tom Brady auto', detail: 'Football · 2000 Playoff Contenders, BGS 9', unit: 'per card' },
  { id: 'card-doncic-prizm', name: 'Luka Dončić #280', detail: 'Basketball · 2018 Prizm, PSA 10', unit: 'per card' },
  { id: 'card-mantle-topps', name: 'Mickey Mantle #311', detail: 'Baseball · 1952 Topps, PSA 5', unit: 'per card' },
  { id: 'card-messi-rookie', name: 'Lionel Messi #71', detail: 'Football · 2004 Panini Mega Cracks', unit: 'per card' },
];

const TOY_SEED: Seed[] = [
  { id: 'toy-lps-675', name: 'Littlest Pet Shop #675', detail: 'Collie, post-2007 mould', unit: 'per figure' },
  { id: 'toy-lps-2', name: 'Littlest Pet Shop #2', detail: 'Dachshund, first wave', unit: 'per figure' },
  { id: 'toy-lps-58', name: 'Littlest Pet Shop #58', detail: 'Shorthair cat, first wave', unit: 'per figure' },
  { id: 'toy-lps-410', name: 'Littlest Pet Shop #410', detail: 'Great Dane, boxed', unit: 'per figure' },
  { id: 'toy-beanie-princess', name: 'Beanie Baby "Princess"', detail: 'Ty, 1997, PVC pellets', unit: 'per plush' },
  { id: 'toy-webkinz-cheeky', name: 'Webkinz Cheeky Monkey', detail: 'Ganz, with unused code', unit: 'per plush' },
  { id: 'toy-squishmallow-jack', name: 'Squishmallow Jack the Cat', detail: '8-inch, original release', unit: 'per plush' },
];

function seedsToRows(seeds: Seed[], category: Category): MasterRow[] {
  return seeds.map((s) => ({
    id: s.id,
    category,
    name: s.name,
    detail: s.detail,
    priceKind: 'usd' as const,
    native: null,
    unit: s.unit,
    chg24: null,
    chg7: null,
    chg30: null,
    source: 'your mark',
    live: false,
    asOf: null,
    manual: true,
  }));
}

export interface NftRow {
  slug: string;
  name: string;
  symbol: string;
  floorUsd: number | null;
  floorNative: number | null;
  nativeSymbol: string;
  mcap: number | null;
  volume24: number | null;
  chg24: number | null;
  chg7: number | null;
  chg30: number | null;
  supply: number | null;
  sales24: number | null;
}

function pctOrNull(v: unknown): number | null {
  // null stays null: CoinGecko omits the change on thin collections, and a zero
  // would read as a flat day rather than an unknown one.
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n / 100 : null;
}

export async function loadNftSnapshot(): Promise<{ asOf: number; collections: NftRow[] } | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}nft-snapshot.json`);
    if (!res.ok) return null;
    const raw = (await res.json()) as { asOf: number; collections: NftRow[] };
    return raw.collections?.length ? raw : null;
  } catch {
    return null;
  }
}

/** One collection's floor, called sparingly because the free tier counts calls. */
export async function refreshNftFloor(slug: string): Promise<NftRow | null> {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/nfts/${slug}`);
    if (!res.ok) return null;
    const d = (await res.json()) as any;
    return {
      slug,
      name: d.name,
      symbol: d.symbol,
      floorUsd: d?.floor_price?.usd ?? null,
      floorNative: d?.floor_price?.native_currency ?? null,
      nativeSymbol: d.native_currency_symbol ?? 'ETH',
      mcap: d?.market_cap?.usd ?? null,
      volume24: d?.volume_24h?.usd ?? null,
      chg24: pctOrNull(d.floor_price_24h_percentage_change),
      chg7: pctOrNull(d.floor_price_7d_percentage_change),
      chg30: pctOrNull(d.floor_price_30d_percentage_change),
      supply: d.total_supply ?? null,
      sales24: d.one_day_sales ?? null,
    };
  } catch {
    return null;
  }
}

/** The mid of an item's last bar, and the day change that goes with it. */
function markOf(item: Item) {
  const bars = item.bars;
  if (!bars.length) return null;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const mid = item.quote ? Math.round((item.quote.ask + item.quote.bid) / 2) : last.c;
  return { mid, chg: prev && prev.c > 0 ? mid / prev.c - 1 : null, t: last.t };
}

export function buildMasterRows(input: {
  osrs: Item[] | null;
  rs3: Item[] | null;
  crypto: Item[] | null;
  nfts: NftRow[] | null;
  overrides: Record<string, ManualEntry>;
}): MasterRow[] {
  const rows: MasterRow[] = [];

  for (const it of input.osrs ?? []) {
    const m = markOf(it);
    if (!m || !m.mid) continue;
    rows.push({
      id: `osrs-${it.meta.id}`,
      category: 'osrs',
      name: it.meta.name,
      detail: it.meta.members ? 'Members · GE' : 'Free to play · GE',
      priceKind: 'gp',
      native: m.mid,
      unit: 'each',
      chg24: m.chg,
      chg7: null,
      chg30: null,
      source: 'OSRS Wiki',
      live: true,
      asOf: m.t,
      manual: false,
    });
  }

  for (const it of input.rs3 ?? []) {
    const m = markOf(it);
    if (!m || !m.mid) continue;
    rows.push({
      id: `rs3-${it.meta.id}`,
      category: 'rs3',
      name: it.meta.name,
      detail: it.meta.members ? 'Members · GE' : 'Free to play · GE',
      priceKind: 'gp',
      native: m.mid,
      unit: 'each',
      chg24: m.chg,
      chg7: null,
      chg30: null,
      source: 'Jagex itemdb',
      live: true,
      asOf: m.t,
      manual: false,
    });
  }

  for (const it of input.crypto ?? []) {
    const bars = it.bars;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    if (!last) continue;
    const px = it.quote?.ask ?? last.c;
    rows.push({
      id: `crypto-${it.meta.id}`,
      category: 'crypto',
      name: it.meta.name,
      detail: 'Spot · 24/7',
      priceKind: 'usd',
      native: px,
      unit: 'per coin',
      chg24: prev && prev.c > 0 ? px / prev.c - 1 : null,
      chg7: null,
      chg30: null,
      source: 'CoinGecko',
      live: true,
      asOf: last.t,
      manual: false,
    });
  }

  for (const n of input.nfts ?? []) {
    if (n.floorUsd == null) continue;
    rows.push({
      id: `nft-${n.slug}`,
      category: 'nft',
      name: n.name,
      detail: `${n.floorNative?.toFixed(2) ?? '—'} ${n.nativeSymbol} floor · ${n.sales24 ?? 0} sales/24h`,
      priceKind: 'usd',
      native: n.floorUsd,
      unit: 'floor',
      chg24: n.chg24,
      chg7: n.chg7,
      chg30: n.chg30,
      source: 'CoinGecko NFT',
      live: true,
      asOf: null,
      manual: false,
      alt: n.floorNative,
      altUnit: n.nativeSymbol,
    });
  }

  rows.push(...seedsToRows(RMT_SEED, 'rmt'));
  rows.push(...seedsToRows(CARD_SEED, 'cards'));
  rows.push(...seedsToRows(TOY_SEED, 'toys'));

  return rows.map((r) => {
    const o = input.overrides[r.id];
    if (!o) return r;
    return { ...r, native: o.usd, asOf: o.asOf, source: 'your mark' };
  });
}

const OVERRIDE_KEY = 'gt-master-marks-v1';

export function useOverrides() {
  const [overrides, setOverrides] = useState<Record<string, ManualEntry>>(() => {
    try {
      return JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? '{}') as Record<string, ManualEntry>;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
    } catch {
      // Storage is optional; the table still works for this session.
    }
  }, [overrides]);

  const setMark = useCallback((id: string, usd: number | null) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (usd == null || !Number.isFinite(usd) || usd < 0) delete next[id];
      else next[id] = { usd, asOf: Date.now() };
      return next;
    });
  }, []);

  return { overrides, setMark };
}

/**
 * Pulls `name` and a dollar figure out of whatever a marketplace export looks
 * like. One row per line, `name<tab|comma|pipe>price`, with an optional currency
 * symbol and thousands separators.
 */
export function parseFeed(text: string): { name: string; usd: number }[] {
  const out: { name: string; usd: number }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = line.trim();
    if (!row) continue;
    const parts = row.split(/\t|,|\|/).map((p) => p.trim());
    if (parts.length < 2) continue;
    const name = parts[0];
    const price = parts.slice(1).find((p) => /^\$?\s*[\d.,]+$/.test(p));
    if (!name || !price) continue;
    const usd = Number(price.replace(/[$,\s]/g, ''));
    if (Number.isFinite(usd) && usd > 0) out.push({ name, usd });
  }
  return out;
}
