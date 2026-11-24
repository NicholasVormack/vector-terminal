export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface ItemMeta {
  id: number;
  name: string;
  /** Buy limit per 4h window. 0 means the venue publishes no limit. */
  limit: number;
  members: boolean;
  examine: string;
}

/** Current instant-buy / instant-sell prices, when the live feed answered. */
export interface Quote {
  ask: number;
  bid: number;
  t: number;
}

export interface Item {
  meta: ItemMeta;
  bars: Bar[];
  quote: Quote | null;
}

export type MarketId = 'osrs' | 'rs3' | 'crypto' | 'collectibles';

/** One venue's panel: its items, whether the quotes are fresh, and the series date. */
export interface MarketLoad {
  items: Item[];
  source: 'snapshot' | 'live';
  asOf: number;
}

/** How a venue charges. Absent tax means the venue takes nothing on a sale. */
export interface MarketRules {
  tax: { rate: number; cap: number; exemptBelow: number } | null;
  /** Taker fee in basis points, charged on both entry and exit. */
  feeBps: number;
  /** True when the feed publishes a bid and an ask rather than one price. */
  hasSpread: boolean;
}

export interface Trade {
  entryI: number;
  exitI: number;
  entryT: number;
  exitT: number;
  entryPx: number;
  exitPx: number;
  qty: number;
  gross: number;
  tax: number;
  pnl: number;
  ret: number;
  barsHeld: number;
  reason: string;
}

export interface EquityPoint {
  t: number;
  v: number;
}

export interface Metrics {
  finalEquity: number;
  totalReturn: number;
  cagr: number;
  vol: number;
  sharpe: number;
  sortino: number;
  maxDD: number;
  maxDDDays: number;
  /** Equity peak the max drawdown was measured from. */
  maxDDPeak: number;
  longestUnderwater: number;
  calmar: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  tradeCount: number;
  avgBarsHeld: number;
  exposure: number;
  bestDay: number;
  worstDay: number;
  taxPaid: number;
  benchReturn: number;
  benchCagr: number;
  benchSharpe: number;
  benchMaxDD: number;
}
