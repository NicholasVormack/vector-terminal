import type { EquityPoint, Metrics, MonthlyRow, Trade } from '../types';

const TRADING_DAYS = 252;
export const RISK_FREE = 0.02;

function mean(x: number[]) {
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0;
}

function stdev(x: number[]) {
  if (x.length < 2) return 0;
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) * (v - m), 0) / (x.length - 1));
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx];
}

export function dailyReturns(series: EquityPoint[]): number[] {
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
  let underwaterStart = -1;
  let longest = 0;

  for (const p of series) {
    if (p.v >= peak) {
      if (underwaterStart >= 0) {
        longest = Math.max(longest, (p.t - underwaterStart) / 86_400_000);
        underwaterStart = -1;
      }
      peak = p.v;
      peakT = p.t;
    } else {
      if (underwaterStart < 0) underwaterStart = p.t;
      const dd = p.v / peak - 1;
      if (dd < mdd) {
        mdd = dd;
        mddDays = (p.t - peakT) / 86_400_000;
      }
    }
  }
  if (underwaterStart >= 0 && series.length) {
    longest = Math.max(longest, (series[series.length - 1].t - underwaterStart) / 86_400_000);
  }
  return { mdd, mddDays, longest: longest > 0 ? longest : mddDays };
}

function monthlyTable(series: EquityPoint[]): MonthlyRow[] {
  const byYear = new Map<number, { months: (number | null)[]; last: number | null }>();
  for (const p of series) {
    const d = new Date(p.t);
    const y = d.getUTCFullYear();
    let row = byYear.get(y);
    if (!row) {
      row = { months: new Array(12).fill(null), last: null };
      byYear.set(y, row);
    }
    row.months[d.getUTCMonth()] = p.v;
  }

  const years = Array.from(byYear.keys()).sort();
  const out: MonthlyRow[] = [];
  let prevYearEnd: number | null = null;
  for (const y of years) {
    const row = byYear.get(y)!;
    const months = row.months.map((v, m) => {
      if (v === null) return null;
      const prev = m === 0 ? prevYearEnd : row.months[m - 1];
      if (prev === null || prev === undefined || prev === 0) return null;
      return v / prev - 1;
    });
    prevYearEnd = row.months.slice().reverse().find((v) => v !== null) ?? prevYearEnd;
    out.push({ year: y, months });
  }
  return out;
}

export function computeMetrics(
  equity: EquityPoint[],
  benchmark: EquityPoint[],
  trades: Trade[],
  exposure: number[],
  turnoverNotional: number,
): Metrics {
  const empty: Metrics = {
    finalEquity: 0,
    totalReturn: 0,
    cagr: 0,
    vol: 0,
    sharpe: 0,
    sortino: 0,
    maxDD: 0,
    maxDDDays: 0,
    longestUnderwater: 0,
    calmar: 0,
    var95: 0,
    cvar95: 0,
    winRate: 0,
    profitFactor: 0,
    expectancy: 0,
    payoff: 0,
    avgWin: 0,
    avgLoss: 0,
    tradeCount: 0,
    avgBarsHeld: 0,
    exposure: 0,
    turnover: 0,
    skew: 0,
    kurtosis: 0,
    beta: 0,
    alpha: 0,
    benchReturn: 0,
    benchCagr: 0,
    benchSharpe: 0,
    benchMaxDD: 0,
    bestDay: 0,
    worstDay: 0,
    bestMonth: 0,
    worstMonth: 0,
    monthly: [],
  };
  if (equity.length < 3) return empty;

  const rets = dailyReturns(equity);
  const benchRets = dailyReturns(benchmark);
  const years = Math.max(1 / 365, (equity[equity.length - 1].t - equity[0].t) / (86_400_000 * 365.25));
  const finalEquity = equity[equity.length - 1].v;
  const totalReturn = finalEquity / equity[0].v - 1;
  const cagr = Math.pow(1 + totalReturn, 1 / years) - 1;
  const vol = stdev(rets) * Math.sqrt(TRADING_DAYS);
  const rfDaily = RISK_FREE / TRADING_DAYS;
  const excess = rets.map((r) => r - rfDaily);
  const sharpe = vol > 0 ? (mean(excess) / stdev(rets)) * Math.sqrt(TRADING_DAYS) : 0;
  const downside = Math.sqrt(mean(rets.map((r) => Math.min(0, r - rfDaily) ** 2)));
  const sortino = downside > 0 ? (mean(excess) / downside) * Math.sqrt(TRADING_DAYS) : 0;
  const dd = maxDrawdown(equity);
  const calmar = dd.mdd < 0 ? cagr / Math.abs(dd.mdd) : 0;

  const sorted = rets.slice().sort((a, b) => a - b);
  const var95 = -quantile(sorted, 0.05);
  const tail = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.05)));
  const cvar95 = -mean(tail);

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? -grossLoss / losses.length : 0;
  const tradeCount = trades.length;
  const winRate = tradeCount ? wins.length / tradeCount : 0;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
  const expectancy = tradeCount ? trades.reduce((s, t) => s + t.pnl, 0) / tradeCount : 0;
  const payoff = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : 0;

  const bench = (() => {
    if (benchmark.length < 2) return { ret: 0, cagr: 0, sharpe: 0, mdd: 0 };
    const bRets = dailyReturns(benchmark);
    const bVol = stdev(bRets) * Math.sqrt(TRADING_DAYS);
    const ret = benchmark[benchmark.length - 1].v / benchmark[0].v - 1;
    const bYears = Math.max(1 / 365, (benchmark[benchmark.length - 1].t - benchmark[0].t) / (86_400_000 * 365.25));
    return {
      ret,
      cagr: Math.pow(1 + ret, 1 / bYears) - 1,
      sharpe: bVol > 0 ? (mean(bRets.map((r) => r - rfDaily)) / stdev(bRets)) * Math.sqrt(TRADING_DAYS) : 0,
      mdd: maxDrawdown(benchmark).mdd,
    };
  })();

  const n = Math.min(rets.length, benchRets.length);
  let beta = 0;
  let alpha = 0;
  if (n > 2 && stdev(benchRets.slice(0, n)) > 0) {
    const mP = mean(rets.slice(0, n));
    const mB = mean(benchRets.slice(0, n));
    let cov = 0;
    let varB = 0;
    for (let i = 0; i < n; i++) {
      cov += (rets[i] - mP) * (benchRets[i] - mB);
      varB += (benchRets[i] - mB) ** 2;
    }
    beta = cov / varB;
    alpha = (mP - beta * mB) * TRADING_DAYS;
  }

  const m = mean(rets);
  const sd = stdev(rets);
  const skew = sd > 0 ? mean(rets.map((r) => ((r - m) / sd) ** 3)) : 0;
  const kurtosis = sd > 0 ? mean(rets.map((r) => ((r - m) / sd) ** 4)) - 3 : 0;

  const monthly = monthlyTable(equity);
  const flatMonths = monthly.flatMap((row) => row.months.filter((v): v is number => v !== null));
  const avgEquity = mean(equity.map((p) => p.v));

  return {
    finalEquity,
    totalReturn,
    cagr,
    vol,
    sharpe,
    sortino,
    maxDD: dd.mdd,
    maxDDDays: dd.mddDays,
    longestUnderwater: dd.longest,
    calmar,
    var95,
    cvar95,
    winRate,
    profitFactor,
    expectancy,
    payoff,
    avgWin,
    avgLoss,
    tradeCount,
    avgBarsHeld: tradeCount ? trades.reduce((s, t) => s + t.barsHeld, 0) / tradeCount : 0,
    exposure: exposure.length ? mean(exposure) : 0,
    turnover: avgEquity > 0 ? turnoverNotional / avgEquity / years : 0,
    skew,
    kurtosis,
    beta,
    alpha,
    benchReturn: bench.ret,
    benchCagr: bench.cagr,
    benchSharpe: bench.sharpe,
    benchMaxDD: bench.mdd,
    bestDay: rets.length ? Math.max(...rets) : 0,
    worstDay: rets.length ? Math.min(...rets) : 0,
    bestMonth: flatMonths.length ? Math.max(...flatMonths) : 0,
    worstMonth: flatMonths.length ? Math.min(...flatMonths) : 0,
    monthly,
  };
}
