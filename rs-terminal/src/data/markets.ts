import type { MarketId, MarketRules } from '../types';
import { GE_TAX } from '../engine/backtest';

export interface MarketDef {
  id: MarketId;
  label: string;
  sub: string;
  /** What one unit is priced in: gp for the game venues, USD everywhere else. */
  native: 'gp' | 'usd';
  rules: MarketRules;
  capital: number;
  capitalStep: number;
  /** Label for the capital input and the per-unit column. */
  unitLabel: string;
  /** One line that explains how a fill happens here. */
  fillNote: string;
  /** The venue, as it should be named in a citation. */
  venue: string;
}

const OSRS: MarketDef = {
  id: 'osrs',
  label: 'OSRS',
  sub: 'Old School',
  native: 'gp',
  rules: { tax: GE_TAX, feeBps: 0, hasSpread: true },
  capital: 10_000_000,
  capitalStep: 1_000_000,
  unitLabel: 'Stack, gp',
  venue: 'OSRS Wiki prices API',
  fillNote:
    'Each day publishes an average instant-buy and an average instant-sell. Entry pays the ask, exit receives the bid, and the 2% sale tax is charged on every sell.',
};

const RS3: MarketDef = {
  id: 'rs3',
  label: 'RS3',
  sub: 'RuneScape 3',
  native: 'gp',
  rules: { tax: null, feeBps: 0, hasSpread: false },
  capital: 500_000_000,
  capitalStep: 10_000_000,
  unitLabel: 'Stack, gp',
  venue: 'Jagex itemdb API',
  fillNote:
    'RS3 publishes one price per day: no bid, no ask, no volume. Fills happen at that price, so there is no spread to pay — which makes an RS3 result optimistic next to an OSRS one and is why the two are never ranked against each other.',
};

const CRYPTO: MarketDef = {
  id: 'crypto',
  label: 'CRYPTO',
  sub: 'spot',
  native: 'usd',
  rules: { tax: null, feeBps: 10, hasSpread: false },
  capital: 10_000,
  capitalStep: 1_000,
  unitLabel: 'Stack, USD',
  venue: 'CoinGecko',
  fillNote:
    'One daily close, fills at that close, 10bps taker fee on both sides. No spread, no funding, no perp. Coins are bought in fractions, so the stack deploys in full instead of rounding down to a whole coin. A daily close is not a price you could have got at 3am.',
};

const COLLECTIBLES: MarketDef = {
  id: 'collectibles',
  label: 'MASTER',
  sub: 'all markets',
  native: 'usd',
  rules: { tax: null, feeBps: 0, hasSpread: false },
  capital: 10_000,
  capitalStep: 1_000,
  unitLabel: 'Budget, USD',
  venue: 'mixed',
  fillNote: 'A monitoring list, not a backtest: these rows carry prices, not daily bars.',
};

export const MARKETS: MarketDef[] = [OSRS, RS3, CRYPTO, COLLECTIBLES];

const BY_ID: Record<MarketId, MarketDef> = {
  osrs: OSRS,
  rs3: RS3,
  crypto: CRYPTO,
  collectibles: COLLECTIBLES,
};

export const marketById = (id: MarketId): MarketDef => BY_ID[id];

/** The two venues that are priced in gold and converted to dollars for display. */
export const isGoldMarket = (id: MarketId): id is 'osrs' | 'rs3' => id === 'osrs' || id === 'rs3';
