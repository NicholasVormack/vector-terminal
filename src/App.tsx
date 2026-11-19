import { useEffect, useMemo, useState } from 'react';
import type { BacktestOptions, Bar } from './types';
import { DEFAULT_OPTIONS } from './types';
import { BY_SYMBOL, INSTRUMENTS } from './data/instruments';
import { getSeries } from './data/simulator';
import { getStoredKey, loadBars, setStoredKey, type SourceId } from './data/providers';
import { deriveFinancials, latest, marketCap, qualityBreakdown } from './data/fundamentals';
import { STRATEGIES, byId, defaultParams } from './engine/strategies';
import { runBacktest } from './engine/backtest';
import { drawdownSeries } from './engine/metrics';
import { bollinger, closes, sma } from './engine/indicators';
import { PriceChart, type Overlay } from './components/PriceChart';
import { AreaChart } from './components/AreaChart';
import { MetricsGrid } from './components/MetricsGrid';
import { MonthlyHeatmap } from './components/MonthlyHeatmap';
import { TradesTable } from './components/TradesTable';
import { Financials } from './components/Financials';
import { Sweep } from './components/Sweep';
import { Engineering } from './components/Engineering';
import { StrategyPanel } from './components/StrategyPanel';
import { fmtCompact, fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice, fmtSignedPct } from './lib/format';

type Tab = 'perf' | 'trades' | 'financials' | 'robust' | 'notes';

const FIRST = BY_SYMBOL.get('NVDA')!;

export default function App() {
  const [symbol, setSymbol] = useState('NVDA');
  const inst = BY_SYMBOL.get(symbol) ?? INSTRUMENTS[0];

  const [source, setSource] = useState<SourceId>('sim');
  const [keyDraft, setKeyDraft] = useState(getStoredKey());
  const [apiKey, setApiKey] = useState(getStoredKey());
  const [bars, setBars] = useState<Bar[]>(() => getSeries(FIRST));
  const [feed, setFeed] = useState({ label: 'Simulated feed', note: `${getSeries(FIRST).length} synthetic sessions` });
  const [feedError, setFeedError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  const [stratId, setStratId] = useState('sma-cross');
  const strategy = byId.get(stratId) ?? STRATEGIES[0];
  const [params, setParams] = useState<Record<string, number>>(() => defaultParams(STRATEGIES[0]));
  const [options, setOptions] = useState<BacktestOptions>(DEFAULT_OPTIONS);
  const [tab, setTab] = useState<Tab>('perf');
  const [logScale, setLogScale] = useState(false);
  const [toggles, setToggles] = useState({ sma20: true, sma50: true, sma200: false, bb: false });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setFeedError('');
      try {
        const res = await loadBars(inst, source, apiKey);
        if (cancelled) return;
        setBars(res.bars);
        setFeed({ label: res.label, note: res.note });
      } catch (err: any) {
        if (cancelled) return;
        setFeedError(err?.message ?? 'Feed request failed');
        const fallback = getSeries(inst);
        setBars(fallback);
        setFeed({ label: 'Simulated feed', note: `${fallback.length} synthetic sessions · live request failed` });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [inst, source, apiKey, reload]);

  const result = useMemo(() => runBacktest(bars, strategy, params, options), [bars, strategy, params, options]);
  const m = result.metrics;

  const overlays = useMemo<Overlay[]>(() => {
    const c = closes(bars);
    const out: Overlay[] = [];
    if (toggles.sma20) out.push({ key: 'sma20', label: 'SMA 20', color: '#5b9dff', data: sma(c, 20) });
    if (toggles.sma50) out.push({ key: 'sma50', label: 'SMA 50', color: '#f5b544', data: sma(c, 50) });
    if (toggles.sma200) out.push({ key: 'sma200', label: 'SMA 200', color: '#a78bfa', data: sma(c, 200) });
    if (toggles.bb) {
      const bb = bollinger(c, 20, 2);
      out.push({ key: 'bbu', label: 'BB upper', color: '#4b5563', data: bb.upper, dash: '4 3' });
      out.push({ key: 'bbl', label: 'BB lower', color: '#4b5563', data: bb.lower, dash: '4 3' });
    }
    return out;
  }, [bars, toggles]);

  const marks = useMemo(
    () =>
      INSTRUMENTS.map((i) => {
        const s = getSeries(i);
        const last = s[s.length - 1].c;
        const prev = s[s.length - 2].c;
        return { inst: i, price: last, chg: last / prev - 1 };
      }),
    [],
  );

  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2] ?? lastBar;
  const dayChg = lastBar && prevBar ? lastBar.c / prevBar.c - 1 : 0;
  const fin = deriveFinancials(inst);
  const quality = qualityBreakdown(inst);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">V</div>
          <div>
            <b>VECTOR</b>
            <span>research terminal</span>
          </div>
        </div>

        <div className="side-section">
          <div className="side-head">
            <h5>Universe</h5>
            <span className="dim">{INSTRUMENTS.length}</span>
          </div>
          <div className="watchlist">
            {marks.map((mk) => (
              <button
                key={mk.inst.symbol}
                className={`wl-row ${mk.inst.symbol === symbol ? 'active' : ''}`}
                onClick={() => setSymbol(mk.inst.symbol)}
              >
                <span className="wl-sym">{mk.inst.symbol}</span>
                <span className="wl-name">{mk.inst.sector}</span>
                <span className="wl-px mono">{fmtPrice(mk.price)}</span>
                <span className={`wl-chg mono ${mk.chg >= 0 ? 'pos' : 'neg'}`}>{fmtSignedPct(mk.chg, 1)}</span>
              </button>
            ))}
          </div>
          <p className="footnote tight">{source === 'sim' ? 'Synthetic marks' : 'Marks for unloaded symbols are synthetic'}</p>
        </div>

        <div className="side-section company-card">
          <div className="cc-head">
            <h5>Company</h5>
            <span className="tag">{inst.sector}</span>
          </div>
          <div className="cc-name">{inst.name}</div>
          <div className="cc-meta">
            {inst.industry} · {inst.exchange}
          </div>
          <p className="cc-desc">{inst.description}</p>
          <div className="cc-stats">
            <div>
              <span>Mkt cap</span>
              <b>${fmtCompact(marketCap(inst))}</b>
            </div>
            <div>
              <span>Employees</span>
              <b>{fmtCompact(inst.employees)}</b>
            </div>
            <div>
              <span>FY{latest(fin).year} rev</span>
              <b>${fmtCompact(latest(fin).revenue * 1e9)}</b>
            </div>
            <div>
              <span>Quality</span>
              <b>{Math.round(quality.total)}</b>
            </div>
          </div>
          <div className="cc-links">
            <span>{inst.hq}</span>
            <span>IPO {inst.ipo}</span>
            <span>{inst.ceo}</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="quote-block">
            <div className="sym">
              <span className="ticker">{inst.symbol}</span>
              <span className="exch">{inst.exchange}</span>
            </div>
            <div className="quote-line">
              <b className="mono">{lastBar ? fmtPrice(lastBar.c) : '—'}</b>
              <span className={`mono ${dayChg >= 0 ? 'pos' : 'neg'}`}>{fmtSignedPct(dayChg)}</span>
              <span className="dim small">
                {lastBar ? `close ${fmtDate(lastBar.t)}` : 'no data'}
              </span>
            </div>
          </div>
          <div className="topbar-right">
            <span className={`feed-pill ${source === 'twelvedata' && !feedError ? 'live' : ''}`}>
              <i />
              {feed.label}
            </span>
            <span className="dim small">{bars.length} bars</span>
          </div>
        </header>

        <section className="strip">
          <div className="strip-cell">
            <span>Net return</span>
            <b className={m.totalReturn >= 0 ? 'pos' : 'neg'}>{fmtSignedPct(m.totalReturn)}</b>
            <em className={m.benchReturn >= 0 ? 'pos' : 'neg'}>{fmtSignedPct(m.benchReturn)} b&h</em>
          </div>
          <div className="strip-cell">
            <span>CAGR</span>
            <b>{fmtSignedPct(m.cagr)}</b>
            <em>{fmtSignedPct(m.benchCagr)} b&h</em>
          </div>
          <div className="strip-cell">
            <span>Sharpe</span>
            <b>{fmtNum(m.sharpe)}</b>
            <em>{fmtNum(m.benchSharpe)} b&h</em>
          </div>
          <div className="strip-cell">
            <span>Max DD</span>
            <b className="neg">{fmtPct(m.maxDD, 1)}</b>
            <em>{fmtPct(m.benchMaxDD, 1)} b&h</em>
          </div>
          <div className="strip-cell">
            <span>Profit factor</span>
            <b>{fmtNum(m.profitFactor)}</b>
            <em>{m.tradeCount} trades</em>
          </div>
          <div className="strip-cell">
            <span>Final equity</span>
            <b>{fmtMoney(m.finalEquity)}</b>
            <em>{fmtPct(m.exposure, 0)} exposure</em>
          </div>
        </section>

        <section className="chart-card">
          <div className="chart-head">
            <div className="chart-title">
              <h2>{inst.symbol}</h2>
              <span className="dim">{inst.name}</span>
              <span className="dim small">· {feed.note}</span>
            </div>
            <div className="chart-tools">
              {(
                [
                  ['sma20', 'SMA 20'],
                  ['sma50', 'SMA 50'],
                  ['sma200', 'SMA 200'],
                  ['bb', 'Bollinger'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`chart-btn ${toggles[key] ? 'on' : ''}`}
                  onClick={() => setToggles((t) => ({ ...t, [key]: !t[key] }))}
                >
                  {label}
                </button>
              ))}
              <button className={`chart-btn ${logScale ? 'on' : ''}`} onClick={() => setLogScale((v) => !v)}>
                Log
              </button>
              <button className="chart-btn" onClick={() => setReload((r) => r + 1)} title="Reload series">
                ↻
              </button>
            </div>
          </div>
          <PriceChart bars={bars} overlays={overlays} trades={result.trades} logScale={logScale} height={400} symbol={inst.symbol} />
          <div className="chart-foot">
            <div className="legend">
              {overlays.map((o) => (
                <span key={o.key}>
                  <i style={{ background: o.color }} />
                  {o.label}
                </span>
              ))}
              <span>
                <i className="tri" /> entry
              </span>
              <span>
                <i className="dot" /> exit
              </span>
            </div>
            <span className="dim small">scroll to zoom · drag to pan · double-click to reset</span>
          </div>
        </section>

        <nav className="tabs">
          {(
            [
              ['perf', 'Performance'],
              ['trades', `Trades · ${result.trades.length}`],
              ['financials', 'Financials'],
              ['robust', 'Robustness'],
              ['notes', 'Engineering'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
          <span className="tab-spacer" />
          <span className="dim small tab-note">
            next-open fills · {options.commissionBps}bps commission · {options.slippageBps}bps slippage · 2% risk-free
          </span>
        </nav>

        <div className="tab-body">
          {tab === 'perf' && (
            <div className="perf">
              <MetricsGrid m={m} />
              <div className="perf-charts">
                <div className="card">
                  <div className="card-head">
                    <h4>Equity curve</h4>
                    <span className="dim small">strategy vs buy &amp; hold</span>
                  </div>
                  <AreaChart series={result.equity} benchmark={result.benchmark} height={200} />
                </div>
                <div className="card">
                  <div className="card-head">
                    <h4>Drawdown</h4>
                    <span className="dim small">peak-to-trough</span>
                  </div>
                  <AreaChart
                    series={result.equity.map((p, i) => ({ t: p.t, v: drawdownSeries(result.equity)[i] }))}
                    mode="drawdown"
                    height={200}
                  />
                </div>
              </div>
              <div className="card">
                <div className="card-head">
                  <h4>Monthly returns</h4>
                  <span className="dim small">% per calendar month, from daily marks</span>
                </div>
                <MonthlyHeatmap rows={m.monthly} />
              </div>
            </div>
          )}
          {tab === 'trades' && <TradesTable trades={result.trades} />}
          {tab === 'financials' && <Financials inst={inst} />}
          {tab === 'robust' && (
            <Sweep bars={bars} strategy={strategy} params={params} options={options} />
          )}
          {tab === 'notes' && <Engineering />}
        </div>
      </main>

      <aside className="rail">
        <StrategyPanel
          strategies={STRATEGIES}
          strategy={strategy}
          onStrategy={(id) => {
            const s = byId.get(id)!;
            setStratId(id);
            setParams(defaultParams(s));
          }}
          params={params}
          onParam={(key, value) => setParams((p) => ({ ...p, [key]: value }))}
          onResetParams={() => setParams(defaultParams(strategy))}
          options={options}
          onOptions={(patch) => setOptions((o) => ({ ...o, ...patch }))}
        />

        <div className="panel-block feed-block">
          <div className="panel-title">
            <h5>Data feed</h5>
          </div>
          <div className="seg">
            <button className={source === 'sim' ? 'on' : ''} onClick={() => setSource('sim')}>
              Simulated
            </button>
            <button className={source === 'twelvedata' ? 'on' : ''} onClick={() => setSource('twelvedata')}>
              Twelve Data
            </button>
          </div>
          {source === 'twelvedata' && (
            <>
              <input
                className="key-input"
                type="password"
                placeholder="API key — stored in this browser"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
              />
              <div className="row-btns">
                <button
                  className="btn sm"
                  onClick={() => {
                    setStoredKey(keyDraft.trim());
                    setApiKey(keyDraft.trim());
                    setReload((r) => r + 1);
                  }}
                >
                  Connect
                </button>
                <button
                  className="link-btn"
                  onClick={() => {
                    setStoredKey('');
                    setKeyDraft('');
                    setApiKey('');
                    setSource('sim');
                  }}
                >
                  clear
                </button>
              </div>
              <p className="footnote">
                Direct browser calls to twelvedata.com/time_series (CORS enabled). Free tier ≈ 800 credits/day. Your key
                stays in localStorage and is never committed.
              </p>
            </>
          )}
          {loading && <p className="muted small">Loading series…</p>}
          {feedError && <p className="err small">{feedError}</p>}
          <p className="dim small">{feed.note}</p>
        </div>
      </aside>
    </div>
  );
}
