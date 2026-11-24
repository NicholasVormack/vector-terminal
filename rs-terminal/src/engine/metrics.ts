import type { EquityPoint, Metrics, Trade } from '../types';

/** The GE never closes, so a year of bars is 365. */
const PERIODS = 365;
export const RISK_FREE = 0;

const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);

function stdev(x: number[]) {
  if (x.length < 2) return 0;
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) * (v - m), 0) / (x.length - 1));
}

export function returnsOf(series: EquityPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].v;
    out.push(prev > 0 ? series[i].v / prev - 1 : 0);
  }
  return out;
}

export function drawdownSeries(series: EquityPoint[]): number[] {
  let peak = series.length ? series[0].v : 0;
  return series.map((p) => {
    peak = Math.max(peak, p.v);
    return peak > 0 ? p.v / peak - 1 : 0;
  });
}

export function maxDrawdown(series: EquityPoint[]) {
  let peak = series.length ? series[0].v : 0;
  let peakT = series.length ? series[0].t : 0;
  let mdd = 0;
  let mddDays = 0;
  /** Equity peak the worst trough was measured against, so the loss can be priced. */
  let mddPeak = 0;
  let underwater = -1;
  let longest = 0;

  for (const p of series) {
    if (p.v >= peak) {
      if (underwater >= 0) {
        longest = Math.max(longest, (p.t - underwater) / 86_400_000);
        underwater = -1;
      }
      peak = p.v;
      peakT = p.t;
    } else {
      if (underwater < 0) underwater = p.t;
      const dd = p.v / peak - 1;
      if (dd < mdd) {
        mdd = dd;
        mddDays = (p.t - peakT) / 86_400_000;
        mddPeak = peak;
      }
    }
  }
  if (underwater >= 0 && series.length) {
    longest = Math.max(longest, (series[series.length - 1].t - underwater) / 86_400_000);
  }
  return { mdd, mddDays, mddPeak, longest: longest > 0 ? longest : mddDays };
}

const emptyMetrics: Metrics = {
  finalEquity: 0,
  totalReturn: 0,
  cagr: 0,
  vol: 0,
  sharpe: 0,
  sortino: 0,
  maxDD: 0,
  maxDDDays: 0,
  maxDDPeak: 0,
  longestUnderwater: 0,
  calmar: 0,
  winRate: 0,
  profitFactor: 0,
  expectancy: 0,
  avgWin: 0,
  avgLoss: 0,
  tradeCount: 0,
  avgBarsHeld: 0,
  exposure: 0,
  bestDay: 0,
  worstDay: 0,
  taxPaid: 0,
  benchReturn: 0,
  benchCagr: 0,
  benchSharpe: 0,
  benchMaxDD: 0,
};

export function computeMetrics(
  equity: EquityPoint[],
  benchmark: EquityPoint[],
  trades: Trade[],
  exposure: number[],
  taxPaid: number,
): Metrics {
  if (equity.length < 3) return emptyMetrics;

  const rets = returnsOf(equity);
  const years = Math.max(1 / 365, (equity[equity.length - 1].t - equity[0].t) / (86_400_000 * 365.25));
  const finalEquity = equity[equity.length - 1].v;
  const totalReturn = finalEquity / equity[0].v - 1;
  const cagr = Math.pow(1 + totalReturn, 1 / years) - 1;
  const sd = stdev(rets);
  const vol = sd * Math.sqrt(PERIODS);
  const sharpe = sd > 0 ? (mean(rets) / sd) * Math.sqrt(PERIODS) : 0;
  const downside = Math.sqrt(mean(rets.map((r) => Math.min(0, r) ** 2)));
  const sortino = downside > 0 ? (mean(rets) / downside) * Math.sqrt(PERIODS) : 0;

  const dd = maxDrawdown(equity);
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  const bench = (() => {
    if (benchmark.length < 2) return { ret: 0, cagr: 0, sharpe: 0, mdd: 0 };
    const r = returnsOf(benchmark);
    const s = stdev(r);
    const ret = benchmark[benchmark.length - 1].v / benchmark[0].v - 1;
    const y = Math.max(
      1 / 365,
      (benchmark[benchmark.length - 1].t - benchmark[0].t) / (86_400_000 * 365.25),
    );
    return {
      ret,
      cagr: Math.pow(1 + ret, 1 / y) - 1,
      sharpe: s > 0 ? (mean(r) / s) * Math.sqrt(PERIODS) : 0,
      mdd: maxDrawdown(benchmark).mdd,
    };
  })();

  return {
    finalEquity,
    totalReturn,
    cagr,
    vol,
    sharpe,
    sortino,
    maxDD: dd.mdd,
    maxDDDays: dd.mddDays,
    maxDDPeak: dd.mddPeak,
    longestUnderwater: dd.longest,
    calmar: dd.mdd < 0 ? cagr / Math.abs(dd.mdd) : 0,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    expectancy: trades.length ? trades.reduce((s, t) => s + t.pnl, 0) / trades.length : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    tradeCount: trades.length,
    avgBarsHeld: trades.length ? mean(trades.map((t) => t.barsHeld)) : 0,
    exposure: exposure.length ? mean(exposure) : 0,
    bestDay: rets.length ? Math.max(...rets) : 0,
    worstDay: rets.length ? Math.min(...rets) : 0,
    taxPaid,
    benchReturn: bench.ret,
    benchCagr: bench.cagr,
    benchSharpe: bench.sharpe,
    benchMaxDD: bench.mdd,
  };
}
