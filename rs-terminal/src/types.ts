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
