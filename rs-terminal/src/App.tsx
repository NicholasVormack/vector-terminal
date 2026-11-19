import { useEffect, useMemo, useState } from 'react';
import type { EquityPoint } from './types';
import { loadMarket, refreshSeries } from './data/api';
import type { MarketLoad } from './data/api';
import { defaultParams, strategyById } from './engine/strategies';
import { runBacktest, taxOn } from './engine/backtest';
import { computeMetrics, drawdownSeries } from './engine/metrics';
import { closes, sma } from './engine/indicators';
import { PriceChart } from './components/PriceChart';
import type { Overlay } from './components/PriceChart';
import { AreaChart } from './components/AreaChart';
import { MetricsGrid } from './components/MetricsGrid';
import type { MetricRow } from './components/MetricsGrid';
import { TradesTable } from './components/TradesTable';
import { FlipTable } from './components/FlipTable';
import { StrategyPanel } from './components/StrategyPanel';
import { fmtDate, fmtGp, fmtGpShort, fmtNum, fmtPct, fmtSignedPct } from './lib/format';

const WINDOWS_PER_DAY = 6;

const TABS = [
  { id: 'perf', label: 'Performance' },
  { id: 'trades', label: 'Trades' },
  { id: 'market', label: 'Market' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function App() {
  const [market, setMarket] = useState<MarketLoad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(451);
  const [strategyId, setStrategyId] = useState('sma-cross');
  const [params, setParams] = useState<Record<string, Record<string, number>>>({});
  const [tab, setTab] = useState<TabId>('perf');
  const [capital, setCapital] = useState(10_000_000);
  const [sizePct, setSizePct] = useState(1);
  const [patient, setPatient] = useState(false);
  const [logScale, setLogScale] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    loadMarket()
      .then((m) => alive && setMarket(m))
      .catch((e: unknown) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    refreshSeries(selectedId).then((bars) => {
      if (!alive || !bars) return;
      setMarket((m) =>
        m ? { ...m, items: m.items.map((it) => (it.meta.id === selectedId ? { ...it, bars } : it)) } : m,
      );
    });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const items = market?.items ?? [];
  const item = items.find((i) => i.meta.id === selectedId) ?? items[0] ?? null;
  const strategy = strategyById(strategyId);

  const activeParams = useMemo(
    () => params[strategyId] ?? defaultParams(strategy),
    [params, strategyId, strategy],
  );

  const signals = useMemo(
    () => (item ? strategy.signals(item.bars, activeParams) : []),
    [item, strategy, activeParams],
  );

  const bt = useMemo(
    () => (item ? runBacktest(item.bars, item.meta, signals, { capital, sizePct, windowsPerDay: WINDOWS_PER_DAY, patient }) : null),
    [item, signals, capital, sizePct, patient],
  );

  const metrics = useMemo(
    () => (bt ? computeMetrics(bt.equity, bt.benchmark, bt.trades, bt.exposure, bt.taxPaid) : null),
    [bt],
  );

  const overlays = useMemo<Overlay[]>(() => {
    if (!item) return [];
    const c = closes(item.bars);
    return [
      { key: 'sma20', label: 'SMA 20', color: 'var(--amber)', data: sma(c, 20) },
      { key: 'sma50', label: 'SMA 50', color: 'var(--violet)', data: sma(c, 50) },
      { key: 'sma200', label: 'SMA 200', color: 'var(--accent)', data: sma(c, 200) },
    ];
  }, [item]);

  const drawdown = useMemo<EquityPoint[]>(() => {
    if (!bt) return [];
    const dd = drawdownSeries(bt.equity);
    return bt.equity.map((p, i) => ({ t: p.t, v: dd[i] }));
  }, [bt]);

  if (error) {
    return (
      <div className="boot">
        <p>The price snapshot could not be loaded.</p>
        <code>{error}</code>
      </div>
    );
  }

  if (!market || !item || !bt || !metrics) {
    return <div className="boot">Loading the exchange…</div>;
  }

  const bars = item.bars;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const mid = last?.c ?? 0;
  const dayChange = prev ? mid / prev.c - 1 : 0;
  const ask = item.quote?.ask ?? last?.h ?? 0;
  const bid = item.quote?.bid ?? last?.l ?? 0;
  const spreadPct = bid > 0 ? (ask - bid) / bid : 0;
  const tax = taxOn(ask);
  const margin = ask - tax - bid;

  const filtered = items.filter((i) => i.meta.name.toLowerCase().includes(query.trim().toLowerCase()));
  const lastSignal = signals[signals.length - 1] === 1 ? 'long' : 'flat';

  const rows: MetricRow[] = [
    {
      label: 'Final stack',
      value: `${fmtGp(metrics.finalEquity)} gp`,
      tone: metrics.finalEquity >= capital ? 'pos' : 'neg',
      note: `started ${fmtGpShort(capital)}`,
    },
    { label: 'Total return', value: fmtSignedPct(metrics.totalReturn), tone: metrics.totalReturn >= 0 ? 'pos' : 'neg' },
    { label: 'CAGR', value: fmtPct(metrics.cagr), tone: metrics.cagr >= 0 ? 'pos' : 'neg' },
    { label: 'Sharpe', value: fmtNum(metrics.sharpe), note: '365-day year' },
    { label: 'Sortino', value: fmtNum(metrics.sortino) },
    { label: 'Max drawdown', value: fmtPct(metrics.maxDD), tone: 'neg', note: `${metrics.maxDDDays.toFixed(0)}d deep` },
    { label: 'Calmar', value: fmtNum(metrics.calmar) },
    { label: 'Volatility', value: fmtPct(metrics.vol, 0) },
    { label: 'Win rate', value: fmtPct(metrics.winRate, 0), note: `${metrics.tradeCount} closed` },
    {
      label: 'Profit factor',
      value: metrics.profitFactor >= 99 ? '∞' : fmtNum(metrics.profitFactor),
      tone: metrics.profitFactor >= 1 ? 'pos' : 'neg',
    },
    { label: 'Avg hold', value: `${metrics.avgBarsHeld.toFixed(0)} d` },
    { label: 'Time in market', value: fmtPct(metrics.exposure, 0) },
    { label: 'GE tax paid', value: `${fmtGpShort(metrics.taxPaid)} gp`, tone: 'neg' },
    { label: 'Best day', value: fmtPct(metrics.bestDay), tone: 'pos' },
    { label: 'Worst day', value: fmtPct(metrics.worstDay), tone: 'neg' },
    {
      label: 'Buy & hold',
      value: fmtSignedPct(metrics.benchReturn),
      note: `Sharpe ${fmtNum(metrics.benchSharpe)} · DD ${fmtPct(metrics.benchMaxDD)}`,
      tone: metrics.benchReturn >= 0 ? 'pos' : 'neg',
    },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          GE<span>TERMINAL</span>
        </div>
        <div className="side-search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items" aria-label="Search items" />
        </div>
        <ul className="item-list">
          {filtered.map((it) => {
            const b = it.bars[it.bars.length - 1];
            const p = it.bars[it.bars.length - 2];
            const chg = p ? b.c / p.c - 1 : 0;
            return (
              <li
                key={it.meta.id}
                className={it.meta.id === item.meta.id ? 'sel' : ''}
                onClick={() => setSelectedId(it.meta.id)}
              >
                <span className="item-name">{it.meta.name}</span>
                <span className="mono item-px">{fmtGpShort(b.c)}</span>
                <span className={`mono ${chg >= 0 ? 'pos' : 'neg'}`}>{fmtSignedPct(chg, 1)}</span>
              </li>
            );
          })}
        </ul>
        <div className="side-foot">
          <span className={market.source === 'live' ? 'dot live' : 'dot'} />
          {market.source === 'live' ? 'live quotes' : 'snapshot only'}
          <br />
          series to {fmtDate(market.asOf)}
        </div>
      </aside>

      <main className="main">
        <header className="item-head">
          <div className="item-title">
            <h1>{item.meta.name}</h1>
            <span className="id mono">{item.meta.id}</span>
            {item.meta.members && <span className="badge">members</span>}
          </div>
          <p className="examine">{item.meta.examine}</p>
          <div className="quote-row">
            <div className="q">
              <span>Mid</span>
              <b className="mono">{fmtGp(mid)}</b>
            </div>
            <div className="q">
              <span>Day</span>
              <b className={`mono ${dayChange >= 0 ? 'pos' : 'neg'}`}>{fmtSignedPct(dayChange)}</b>
            </div>
            <div className="q">
              <span>Ask</span>
              <b className="mono">{fmtGp(ask)}</b>
            </div>
            <div className="q">
              <span>Bid</span>
              <b className="mono">{fmtGp(bid)}</b>
            </div>
            <div className="q">
              <span>Spread</span>
              <b className="mono dim">{fmtPct(spreadPct, 1)}</b>
            </div>
            <div className="q">
              <span>Margin after tax</span>
              <b className={`mono ${margin >= 0 ? 'pos' : 'neg'}`}>{fmtGp(margin)}</b>
            </div>
            <div className="q">
              <span>Buy limit</span>
              <b className="mono dim">{fmtGp(item.meta.limit)} / 4h</b>
            </div>
            <div className="q">
              <span>Volume</span>
              <b className="mono dim">{fmtGpShort(last.v)}</b>
            </div>
          </div>
        </header>

        <section className="panel chart-panel">
          <div className="panel-head">
            <h3>
              Daily mid <span className="dim">· {bars.length} bars</span>
            </h3>
            <div className="chart-actions">
              <button className={logScale ? 'on' : ''} onClick={() => setLogScale((v) => !v)}>
                log
              </button>
            </div>
          </div>
          <PriceChart bars={bars} overlays={overlays} trades={bt.trades} logScale={logScale} />
          <p className="chart-note">
            One candle is one day: the wick is the range this item actually traded between (average instant-sell
            to average instant-buy), the body is the move in the mid. Wheel to zoom, drag to pan, double-click to
            reset.
          </p>
        </section>

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'perf' && (
          <>
            <MetricsGrid rows={rows} />
            <section className="panel">
              <div className="panel-head">
                <h3>Equity</h3>
                <span className="panel-note">solid: strategy · dashed: buy &amp; hold, same fills</span>
              </div>
              <AreaChart points={bt.equity} bench={bt.benchmark} kind="equity" />
            </section>
            <section className="panel">
              <div className="panel-head">
                <h3>Drawdown</h3>
                <span className="panel-note">from the running peak of liquidated equity</span>
              </div>
              <AreaChart points={drawdown} kind="drawdown" height={150} />
            </section>
          </>
        )}

        {tab === 'trades' && (
          <section className="panel">
            <div className="panel-head">
              <h3>Trade blotter</h3>
              <span className="panel-note">
                {bt.trades.length} closed · {fmtGpShort(metrics.taxPaid)} gp taxed
              </span>
            </div>
            <TradesTable trades={bt.trades} />
            <p className="chart-note">
              Net is after the 2% sale tax (floored per item, capped at 5m, nothing under 50 gp) and after crossing
              the spread both ways unless patient offers are on. Return ignores the gp left in cash.
            </p>
          </section>
        )}

        {tab === 'market' && (
          <section className="panel">
            <div className="panel-head">
              <h3>Margin scanner</h3>
              <span className="panel-note">click a row to load it</span>
            </div>
            <FlipTable items={items} selectedId={item.meta.id} onSelect={setSelectedId} />
            <p className="chart-note">
              Margin is what one unit nets if it is bought at the day’s bid and sold at the day’s ask after tax —
              two resting offers. Crossing on both sides costs you the spread, which is what the backtest charges
              by default. Capacity is the buy limit across six 4-hour windows at the ask.
            </p>
          </section>
        )}
      </main>

      <aside className="rail">
        <StrategyPanel
          strategy={strategy}
          params={activeParams}
          onStrategy={setStrategyId}
          onParam={(key, value) =>
            setParams((prev) => ({
              ...prev,
              [strategyId]: { ...(prev[strategyId] ?? defaultParams(strategy)), [key]: value },
            }))
          }
          capital={capital}
          onCapital={setCapital}
          sizePct={sizePct}
          onSizePct={setSizePct}
          patient={patient}
          onPatient={setPatient}
        />

        <section className="panel-block">
          <h4>Position</h4>
          <div className="kv">
            <span>Last signal</span>
            <b className={lastSignal === 'long' ? 'pos' : 'dim'}>{lastSignal}</b>
          </div>
          <div className="kv">
            <span>Closed trades</span>
            <b>{metrics.tradeCount}</b>
          </div>
          <div className="kv">
            <span>Open at end</span>
            <b className="dim">liquidated</b>
          </div>
          <div className="kv">
            <span>Exposure</span>
            <b>{fmtPct(metrics.exposure, 0)}</b>
          </div>
        </section>

        <section className="panel-block">
          <h4>What this is</h4>
          <p className="blurb">
            A one-item backtester, not a portfolio. You are either holding this item or holding gp, so the only
            question it answers is whether a rule beat the spread and the tax on this item over the last year.
          </p>
          <p className="blurb">
            Prices come from the OSRS Wiki prices API. {market.source === 'live' ? 'Live quotes loaded just now' : 'The feed did not answer, so the bundled snapshot is showing'}
            ; the daily series is bundled and dated {fmtDate(market.asOf)}.
          </p>
        </section>
      </aside>
    </div>
  );
}
