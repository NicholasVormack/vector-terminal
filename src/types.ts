export interface Bar {
  /** UTC ms at 00:00 of the trading day */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Side = 'long' | 'short';

export interface Trade {
  side: Side;
  entryI: number;
  entryT: number;
  entryPx: number;
  exitI: number;
  exitT: number;
  exitPx: number;
  qty: number;
  notional: number;
  pnl: number;
  ret: number;
  costs: number;
  barsHeld: number;
  mae: number;
  mfe: number;
  exitReason: string;
}

export interface EquityPoint {
  t: number;
  v: number;
}

export interface BacktestOptions {
  initialCapital: number;
  /** round-trip cost per side, basis points of notional */
  commissionBps: number;
  minCommission: number;
  slippageBps: number;
  /** nextOpen avoids lookahead bias; close is the optimistic same-bar fill */
  fill: 'nextOpen' | 'close';
  allowShort: boolean;
  /** 0 disables */
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
}

export const DEFAULT_OPTIONS: BacktestOptions = {
  initialCapital: 100_000,
  commissionBps: 2,
  minCommission: 1,
  slippageBps: 2,
  fill: 'nextOpen',
  allowShort: false,
  stopLossPct: 0,
  takeProfitPct: 0,
  trailingStopPct: 0,
};

export interface MonthlyRow {
  year: number;
  months: (number | null)[];
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
  var95: number;
  cvar95: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  payoff: number;
  avgWin: number;
  avgLoss: number;
  tradeCount: number;
  avgBarsHeld: number;
  exposure: number;
  turnover: number;
  skew: number;
  kurtosis: number;
  beta: number;
  alpha: number;
  benchReturn: number;
  benchCagr: number;
  benchSharpe: number;
  benchMaxDD: number;
  bestDay: number;
  worstDay: number;
  bestMonth: number;
  worstMonth: number;
  monthly: MonthlyRow[];
}

export interface RunResult {
  equity: EquityPoint[];
  benchmark: EquityPoint[];
  trades: Trade[];
  metrics: Metrics;
  options: BacktestOptions;
  bars: Bar[];
  warmup: number;
}

export interface RatioSet {
  grossMargin: number;
  opMargin: number;
  netMargin: number;
  fcfMargin: number;
  roe: number;
  roa: number;
  roic: number;
  netDebtEbitda: number;
  currentRatio: number;
  assetTurnover: number;
  revGrowth: number;
  epsGrowth: number;
}

export interface FiscalYear {
  year: number;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  eps: number;
  shares: number;
  cash: number;
  totalDebt: number;
  totalAssets: number;
  equity: number;
  currentAssets: number;
  currentLiabilities: number;
  operatingCashFlow: number;
  capex: number;
  freeCashFlow: number;
  ratios: RatioSet;
}

export interface Instrument {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  country: string;
  hq: string;
  employees: number;
  ceo: string;
  website: string;
  ipo: number;
  description: string;
  /** last traded price the simulated series is scaled to */
  price: number;
  /** annualised volatility fraction */
  vol: number;
  beta: number;
  dividendYield: number;
  sharesOut: number;
  revenue: number[];
  netIncome: number[];
  years: number[];
  grossMargin: number;
  opMargin: number;
  fcfMargin: number;
  capexPct: number;
  cash: number;
  totalDebt: number;
  totalAssets: number;
  equity: number;
  currentAssets: number;
  currentLiabilities: number;
  qualityScore: number;
}

export interface DataSourceInfo {
  id: 'sim' | 'twelvedata';
  label: string;
  bars: number;
  note: string;
}
