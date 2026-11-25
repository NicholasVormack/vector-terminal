import type { Item } from '../types';
import { useCallback, useEffect, useState } from 'react';
import { changeSinceSettledClose } from './crypto';

/**
 * The master list.
 *
 * A row is either fed by a venue or priced by you, and the table says which,
 * because a number with an unknown provenance is worse than no number:
 *
 *   live   crypto quotes, NFT floors, OSRS and RS3 prices, each refreshed from the
 *          venue that owns the price
 *   marks  physical cards, toys and marketplace gold. There is no free, licensed
 *          feed for any of these — TCGplayer and eBay both gate theirs behind
 *          credentials, and Eldorado has no public buyer API at all — so these rows
 *          start empty and are priced by whoever is watching them.
 */
export type Category = 'crypto' | 'nft' | 'osrs' | 'rs3' | 'rmt' | 'cards' | 'toys' | 'feed';

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
  { id: 'feed', label: 'Feed', blurb: 'Names pasted from a marketplace export that matched no catalogue row.' },
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
  /** True when a venue feed owns the number; false when it is yours to set. */
  live: boolean;
  asOf: number | null;
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
  { id: 'rmt-rs3-bond', name: 'RS3 bond', detail: 'Jagex, official — same purchase, RS3 gold price', unit: 'per bond' },
  { id: 'rmt-wow-gold', name: 'WoW gold', detail: 'Retail, per-server listings', unit: 'per 10k gold' },
  { id: 'rmt-wow-classic-gold', name: 'WoW classic gold', detail: 'Classic era, per-server listings', unit: 'per 10k gold' },
  { id: 'rmt-wow-token', name: 'WoW token', detail: 'Blizzard, auction-house traded', unit: 'per token' },
  { id: 'rmt-ffxiv-gil', name: 'FFXIV gil', detail: 'Per data centre', unit: 'per 1M gil' },
  { id: 'rmt-poe-chaos', name: 'Path of Exile chaos', detail: 'League economy', unit: 'per 100 chaos' },
  { id: 'rmt-poe-divine', name: 'Path of Exile divine', detail: 'League economy', unit: 'per divine' },
  { id: 'rmt-nw-coin', name: 'New World coin', detail: 'Per server, seasonal', unit: 'per 10k coin' },
  { id: 'rmt-eso-gold', name: 'ESO gold', detail: 'Per platform and megaserver', unit: 'per 1M gold' },
  { id: 'rmt-albion-silver', name: 'Albion silver', detail: 'Per server, seasonal', unit: 'per 1M silver' },
  { id: 'rmt-tibia-coins', name: 'Tibia coins', detail: 'CipSoft, official', unit: 'per 250 TC' },
];

const CARD_SEED: Seed[] = [
  { id: 'card-charizard-base', name: 'Charizard, Base Set 1st ed.', detail: 'Pokémon · PSA 9', unit: 'per card' },
  { id: 'card-charizard-shadowless', name: 'Charizard, Base Set shadowless', detail: 'Pokémon · PSA 9', unit: 'per card' },
  { id: 'card-blastoise-base', name: 'Blastoise, Base Set 1st ed.', detail: 'Pokémon · PSA 9', unit: 'per card' },
  { id: 'card-venusaur-base', name: 'Venusaur, Base Set 1st ed.', detail: 'Pokémon · PSA 9', unit: 'per card' },
  { id: 'card-mewtwo-base', name: 'Mewtwo, Base Set 1st ed.', detail: 'Pokémon · PSA 9', unit: 'per card' },
  { id: 'card-pikachu-base', name: 'Pikachu, Base Set 1st ed.', detail: 'Pokémon · PSA 10', unit: 'per card' },
  { id: 'card-pikachu-illustrator', name: 'Pikachu Illustrator', detail: 'Pokémon · 1998 CoroCoro promo, unnumbered, raw', unit: 'per card' },
  { id: 'card-lugia-neo', name: 'Lugia, Neo Genesis 1st ed.', detail: 'Pokémon · PSA 9', unit: 'per card' },
  { id: 'card-umbreon-skyridge', name: 'Umbreon, Skyridge holo', detail: 'Pokémon · PSA 10', unit: 'per card' },
  { id: 'card-rayquaza-goldstar', name: 'Rayquaza gold star, EX Deoxys', detail: 'Pokémon · PSA 9', unit: 'per card' },
  { id: 'card-mew-goldstar', name: 'Mew gold star, Dragon Frontiers', detail: 'Pokémon · PSA 9', unit: 'per card' },
  { id: 'card-umbreon-vmax', name: 'Umbreon VMAX alt art', detail: 'Pokémon · Evolving Skies, PSA 10', unit: 'per card' },
  { id: 'card-gengar-vmax', name: 'Gengar VMAX alt art', detail: 'Pokémon · Fusion Strike, PSA 10', unit: 'per card' },
  { id: 'card-sylveon-vmax', name: 'Sylveon VMAX alt art', detail: 'Pokémon · Evolving Skies, PSA 10', unit: 'per card' },
  { id: 'card-base-booster-box', name: 'Base Set booster box', detail: 'Pokémon · 1999, 1st edition, sealed', unit: 'per box' },
  { id: 'card-jordan-fleer', name: 'Michael Jordan #57', detail: 'Basketball · 1986 Fleer, PSA 8', unit: 'per card' },
  { id: 'card-lebron-chrome', name: 'LeBron James #111', detail: 'Basketball · 2003 Topps Chrome, PSA 10', unit: 'per card' },
  { id: 'card-doncic-prizm', name: 'Luka Dončić #280', detail: 'Basketball · 2018 Prizm, PSA 10', unit: 'per card' },
  { id: 'card-brady-contenders', name: 'Tom Brady auto', detail: 'Football · 2000 Playoff Contenders, BGS 9', unit: 'per card' },
  { id: 'card-mahomes-prizm', name: 'Patrick Mahomes #269', detail: 'Football · 2017 Prizm, PSA 10', unit: 'per card' },
  { id: 'card-mantle-topps', name: 'Mickey Mantle #311', detail: 'Baseball · 1952 Topps, PSA 5', unit: 'per card' },
  { id: 'card-trout-update', name: 'Mike Trout #US175', detail: 'Baseball · 2011 Topps Update, PSA 10', unit: 'per card' },
  { id: 'card-t206-cobb', name: 'Ty Cobb, T206', detail: 'Baseball · 1909 tobacco issue, raw', unit: 'per card' },
  { id: 'card-gretzky-opc', name: 'Wayne Gretzky #18', detail: 'Hockey · 1979 O-Pee-Chee, PSA 9', unit: 'per card' },
  { id: 'card-messi-rookie', name: 'Lionel Messi #71', detail: 'Football · 2004-05 Panini Mega Cracks', unit: 'per card' },
  { id: 'card-ronaldo-rookie', name: 'Cristiano Ronaldo #137', detail: 'Football · 2002-03 Panini Mega Craques, PSA 9', unit: 'per card' },
];

function lps(n: string, mould: string): Seed {
  return {
    id: `toy-lps-${n}`,
    name: `Littlest Pet Shop #${n}`,
    detail: LPS_NOTES[n] ?? `${mould}, G2 mould`,
    unit: 'per figure',
  };
}

/**
 * Littlest Pet Shop is catalogued by number, which is how listings name a figure:
 * "#675" travels better than a colour nobody agrees on. Every number below is on
 * that mould's published G2 list, and the mould is all that is claimed: colour,
 * packaging and year all change between releases under the same number.
 */
const LPS_NOTES: Record<string, string> = {
  '2': 'Pug, 2005 pet pairs — sold with #1',
  '58': 'Collie, 2005 Portable Pets',
  '410': 'Shorthair cat, Round & Round Pet Town bonus',
  '675': "Dachshund, 2008 Pet Trainin' Park 3-pack",
};

const LPS_SHORTHAIR = ['5', '19', '64', '71', '106', '125', '138', '228', '246', '318', '391', '410'];
const LPS_COLLIE = ['58', '67', '237', '272', '363', '893', '1262', '2210'];
const LPS_DACHSHUND = ['139', '325', '518', '640', '675', '909', '1010', '1211'];
const LPS_GREAT_DANE = ['184', '244', '577', '588', '817', '1022'];

const TOY_SEED: Seed[] = [
  ...LPS_SHORTHAIR.map((n) => lps(n, 'Shorthair cat')),
  ...LPS_COLLIE.map((n) => lps(n, 'Collie')),
  ...LPS_DACHSHUND.map((n) => lps(n, 'Dachshund')),
  ...LPS_GREAT_DANE.map((n) => lps(n, 'Great Dane')),
  lps('2', 'Pug'),
  { id: 'toy-beanie-princess', name: 'Beanie Baby "Princess"', detail: 'Ty, 1997, Diana tribute bear', unit: 'per plush' },
  { id: 'toy-beanie-valentino', name: 'Beanie Baby "Valentino"', detail: 'Ty, 1994, original release', unit: 'per plush' },
  { id: 'toy-beanie-peanut', name: 'Beanie Baby "Peanut"', detail: 'Ty, 1995, royal blue', unit: 'per plush' },
  { id: 'toy-webkinz-cheeky', name: 'Webkinz Cheeky Monkey', detail: 'Ganz, with unused code', unit: 'per plush' },
  { id: 'toy-webkinz-stallion', name: 'Webkinz Black Stallion', detail: 'Ganz, with unused code', unit: 'per plush' },
  { id: 'toy-squishmallow-jack', name: 'Squishmallow Jack the Cat', detail: 'Black cat, 8-inch', unit: 'per plush' },
  { id: 'toy-squishmallow-patty', name: 'Squishmallow Patty the Cow', detail: '12-inch', unit: 'per plush' },
  { id: 'toy-squishmallow-ronnie', name: 'Squishmallow Ronnie the Cow', detail: '16-inch', unit: 'per plush' },
  { id: 'toy-barbie-1959', name: 'Barbie #1 ponytail', detail: 'Mattel, 1959, brunette', unit: 'per doll' },
  { id: 'toy-americangirl-samantha', name: 'American Girl Samantha', detail: 'Pleasant Company, 1986, retired', unit: 'per doll' },
  { id: 'toy-hotwheels-camaro', name: 'Hot Wheels Redline Custom Camaro', detail: 'Mattel, 1968, redline wheels', unit: 'per car' },
  { id: 'toy-lego-10179', name: 'LEGO 10179 UCS Millennium Falcon', detail: 'LEGO, 2007, sealed', unit: 'per set' },
  { id: 'toy-tamagotchi-1997', name: 'Tamagotchi original', detail: 'Bandai, 1997, sealed', unit: 'per unit' },
  { id: 'toy-pollypocket-1989', name: 'Polly Pocket Bluebird compact', detail: 'Bluebird, 1989, complete', unit: 'per set' },
  { id: 'toy-mlp-applejack', name: 'My Little Pony Applejack', detail: 'G1, Year Two (1983-84)', unit: 'per figure' },
  { id: 'toy-carebear-cheer', name: 'Care Bear Cheer Bear', detail: 'Kenner, 1983', unit: 'per plush' },
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
  }));
}

/** A row the marketplace feed created, because no catalogue row carried its name. */
export interface CustomRow {
  id: string;
  name: string;
  usd: number;
  asOf: number;
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

/** An OSRS or RS3 item at its last mid, with the day change that goes with it. */
function gpRows(items: Item[] | null, category: 'osrs' | 'rs3', source: string): MasterRow[] {
  const out: MasterRow[] = [];
  for (const it of items ?? []) {
    const m = markOf(it);
    if (!m || !m.mid) continue;
    out.push({
      id: `${category}-${it.meta.id}`,
      category,
      name: it.meta.name,
      detail: it.meta.members ? 'Members · GE' : 'Free to play · GE',
      priceKind: 'gp',
      native: m.mid,
      unit: 'each',
      chg24: m.chg,
      chg7: null,
      chg30: null,
      source,
      live: true,
      asOf: m.t,
    });
  }
  return out;
}

export function buildMasterRows(input: {
  osrs: Item[] | null;
  rs3: Item[] | null;
  crypto: Item[] | null;
  nfts: NftRow[] | null;
  overrides: Record<string, ManualEntry>;
  custom: CustomRow[];
}): MasterRow[] {
  const rows: MasterRow[] = [
    ...gpRows(input.osrs, 'osrs', 'OSRS Wiki'),
    ...gpRows(input.rs3, 'rs3', 'Jagex itemdb'),
  ];

  for (const it of input.crypto ?? []) {
    const bars = it.bars;
    const last = bars[bars.length - 1];
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
      // A crypto series ends on its last settled close, so the live quote is measured
      // against that bar; without one, the newest settled day is the last move.
      chg24: changeSinceSettledClose(bars, it.quote ? px : null),
      chg7: null,
      chg30: null,
      source: 'CoinGecko',
      live: true,
      asOf: last.t,
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
      alt: n.floorNative,
      altUnit: n.nativeSymbol,
    });
  }

  rows.push(...seedsToRows(RMT_SEED, 'rmt'));
  rows.push(...seedsToRows(CARD_SEED, 'cards'));
  rows.push(...seedsToRows(TOY_SEED, 'toys'));

  for (const c of input.custom) {
    rows.push({
      id: c.id,
      category: 'feed',
      name: c.name,
      detail: 'pasted from a marketplace feed',
      priceKind: 'usd',
      native: c.usd,
      unit: 'per item',
      chg24: null,
      chg7: null,
      chg30: null,
      source: 'marketplace feed',
      live: false,
      asOf: c.asOf,
    });
  }

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

const CUSTOM_KEY = 'gt-master-custom-v1';

/** A pasted name becomes a stable id, so re-pasting the line updates its row. */
function feedRowId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `feed-${slug || 'row'}`;
}

/** Rows the feed created from names that matched nothing in the catalogue. */
export function useCustomRows() {
  const [custom, setCustom] = useState<CustomRow[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]');
      return Array.isArray(raw) ? (raw as CustomRow[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
    } catch {
      // Storage is optional; the row still shows for this session.
    }
  }, [custom]);

  const addRow = useCallback((name: string, usd: number) => {
    const id = feedRowId(name);
    setCustom((prev) => [...prev.filter((r) => r.id !== id), { id, name, usd, asOf: Date.now() }]);
    return id;
  }, []);

  const removeRow = useCallback((id: string) => {
    setCustom((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { custom, addRow, removeRow };
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
