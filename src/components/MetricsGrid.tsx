import type { Metrics } from '../types';
import { fmtMoney, fmtNum, fmtPct, fmtSignedPct } from '../lib/format';

interface Props {
  m: Metrics;
}

function Cell({
  label,
  value,
  sub,
  tone,
  hint,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'pos' | 'neg' | 'flat';
  hint?: string;
}) {
  return (
    <div className="metric-cell" title={hint}>
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export function MetricsGrid({ m }: Props) {
  return (
    <div className="metrics-grid">
      <Cell label="Net return" value={fmtSignedPct(m.totalReturn)} tone={m.totalReturn >= 0 ? 'pos' : 'neg'} sub={`bench ${fmtSignedPct(m.benchReturn)}`} />
      <Cell label="CAGR" value={fmtSignedPct(m.cagr)} sub={`bench ${fmtSignedPct(m.benchCagr)}`} />
      <Cell label="Sharpe" value={fmtNum(m.sharpe)} hint="Annualised, 2% risk-free" sub={`bench ${fmtNum(m.benchSharpe)}`} />
      <Cell label="Sortino" value={fmtNum(m.sortino)} hint="Downside-deviation adjusted" />
      <Cell label="Max drawdown" value={fmtPct(m.maxDD)} tone="neg" sub={`${Math.round(m.maxDDDays)}d peak-to-trough`} />
      <Cell label="Calmar" value={fmtNum(m.calmar)} hint="CAGR / |max drawdown|" />
      <Cell label="Volatility" value={fmtPct(m.vol, 1)} sub="annualised" />
      <Cell label="Beta / alpha" value={`${fmtNum(m.beta)} / ${fmtSignedPct(m.alpha, 1)}`} sub="vs buy & hold" hint="Daily returns, annualised alpha" />
      <Cell label="Profit factor" value={fmtNum(m.profitFactor)} sub={`${m.tradeCount} trades`} />
      <Cell label="Win rate" value={fmtPct(m.winRate, 1)} sub={`payoff ${fmtNum(m.payoff)}`} />
      <Cell label="Expectancy" value={fmtMoney(m.expectancy)} sub="per trade" tone={m.expectancy >= 0 ? 'pos' : 'neg'} />
      <Cell label="Exposure" value={fmtPct(m.exposure, 0)} sub={`turnover ${fmtNum(m.turnover, 1)}x/yr`} />
      <Cell label="VaR 95" value={fmtPct(m.var95)} sub={`CVaR ${fmtPct(m.cvar95)}`} hint="One-day historical, positive = loss" />
      <Cell label="Skew / kurtosis" value={`${fmtNum(m.skew)} / ${fmtNum(m.kurtosis)}`} sub="daily returns" />
      <Cell label="Best / worst day" value={`${fmtSignedPct(m.bestDay, 1)} / ${fmtSignedPct(m.worstDay, 1)}`} />
      <Cell label="Avg hold" value={`${fmtNum(m.avgBarsHeld, 0)} bars`} sub={`${m.longestUnderwater ? Math.round(m.longestUnderwater) + 'd underwater' : '—'}`} />
    </div>
  );
}
