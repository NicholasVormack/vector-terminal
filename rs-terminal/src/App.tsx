import { useEffect, useMemo, useRef, useState } from 'react';
import type { EquityPoint, MarketId, MarketLoad } from './types';
import { loadMarket, refreshSeries } from './data/api';
import { loadRs3 } from './data/rs3';
import { fetchQuotes, loadCrypto, refreshCryptoSeries } from './data/crypto';
import type { CryptoLoad } from './data/crypto';
import { loadNftSnapshot } from './data/collectibles';
import type { NftRow } from './data/collectibles';
import { isGoldMarket, marketById } from './data/markets';
import { fxFor, gpToUsd, useFx } from './data/fx';
import { defaultParams, strategyById } from './engine/strategies';
import { WINDOWS_PER_DAY, runBacktest, taxFor } from './engine/backtest';
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
import { MarketBar } from './components/MarketBar';
import { FxPanel } from './components/FxPanel';
import { MasterList } from './components/MasterList';
import {
  fmtDate,
  fmtGp,
  fmtGpShort,
  fmtNum,
  fmtPct,
  fmtSignedPct,
  fmtUsd,
  fmtUsdShort,
} from './lib/format';

const TABS = [
  { id: 'perf', label: 'Performance' },
  { id: 'trades', label: 'Trades' },
  { id: 'market', label: 'Market' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Each market starts on the item that makes its panel say something. */
const FIRST_PICK: Record<MarketId, number> = { osrs: 451, rs3: 44840, crypto: 1, collectibles: 0 };

export function App() {
  const [market, setMarket] = useState<MarketId>('osrs');
  const def = marketById(market);
  const { fx, patch: patchFx, reset: resetFx } = useFx();

  const [osrs, setOsrs] = useState<MarketLoad | null>(null);
  const [rs3, setRs3] = useState<MarketLoad | null>(null);
  const [crypto, setCrypto] = useState<CryptoLoad | null>(null);
  const [nfts, setNfts] = useState<NftRow[] | null>(null);
  const [nftAsOf, setNftAsOf] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [picked, setPicked] = useState<Record<MarketId, number>>(FIRST_PICK);
  /** Only the venues the user has retyped have an entry; the rest fall back to def.capital. */
  const [caps, setCaps] = useState<Partial<Record<MarketId, number>>>({});
  const [strategyId, setStrategyId] = useState('sma-cross');
  const [params, setParams] = useState<Record<string, Record<string, number>>>({});
  const [tab, setTab] = useState<TabId>('perf');
  const [sizePct, setSizePct] = useState(1);
  const [patient, setPatient] = useState(false);
  const [logScale, setLogScale] = useState(true);
  const [query, setQuery] = useState('');

  const refreshedCoins = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;

    /** Keep the pick when this snapshot still lists it, else fall to the first row. */
    const settle = (id: MarketId, m: MarketLoad) =>
      setPicked((p) => {
        if (m.items.some((i) => i.meta.id === p[id])) return p;
        const next = { ...p };
        next[id] = m.items[0]?.meta.id ?? 0;
        return next;
      });

    loadMarket()
      .then((m) => {
        if (!alive) return;
        setOsrs(m);
        settle('osrs', m);
      })
      .catch((e: unknown) => alive && setError(String(e)));

    loadRs3()
      .then((m) => {
        if (!alive) return;
        setRs3(m);
        settle('rs3', m);
      })
      .catch(() => undefined);

    loadCrypto()
      .then((m) => {
        if (!alive) return;
        setCrypto(m);
        settle('crypto', m);
        // One bulk quote call covers every coin in the panel, so it is worth one request.
        const slugs = m.items.map((i) => m.slugById.get(i.meta.id) ?? '').filter(Boolean);
        fetchQuotes(slugs).then((prices) => {
          if (!alive || !prices) return;
          setCrypto((c) =>
            c
              ? {
                  ...c,
                  source: 'live',
                  items: c.items.map((it) => {
                    const px = prices.get(c.slugById.get(it.meta.id) ?? '');
                    return px ? { ...it, quote: { ask: px, bid: px, t: Date.now() } } : it;
                  }),
                }
              : c,
          );
        });
      })
      .catch(() => undefined);

    loadNftSnapshot().then((s) => {
      if (!alive || !s) return;
      setNfts(s.collections);
      setNftAsOf(s.asOf);
    });

    return () => {
      alive = false;
    };
  }, []);

  const selectedId = picked[market];
  const active = market === 'osrs' ? osrs : market === 'rs3' ? rs3 : market === 'crypto' ? crypto : null;
  const items = active?.items ?? [];
  const item = items.find((i) => i.meta.id === selectedId) ?? items[0] ?? null;
  const strategy = strategyById(strategyId);

  const pick = (id: number) => setPicked((p) => ({ ...p, [market]: id }));

  /** Newer daily bars for the selected OSRS item. */
  useEffect(() => {
    if (market !== 'osrs' || !selectedId) return;
    let alive = true;
    refreshSeries(selectedId).then((bars) => {
      if (!alive || !bars) return;
      setOsrs((m) =>
        m ? { ...m, items: m.items.map((it) => (it.meta.id === selectedId ? { ...it, bars } : it)) } : m,
      );
    });
    return () => {
      alive = false;
    };
  }, [market, selectedId]);

  /**
   * CoinGecko's free tier is the binding constraint here, so a coin's history is
   * fetched once per session and never polled.
   */
  useEffect(() => {
    if (market !== 'crypto' || !crypto || !selectedId) return;
    const slug = crypto.slugById.get(selectedId);
    if (!slug || refreshedCoins.current.has(slug)) return;
    refreshedCoins.current.add(slug);
    let alive = true;
    refreshCryptoSeries(slug).then((bars) => {
      if (!alive || !bars) return;
      setCrypto((c) =>
        c ? { ...c, items: c.items.map((it) => (it.meta.id === selectedId ? { ...it, bars } : it)) } : c,
      );
    });
    return () => {
      alive = false;
    };
  }, [market, selectedId, crypto]);

  const activeParams = useMemo(
    () => params[strategyId] ?? defaultParams(strategy),
    [params, strategyId, strategy],
  );

  const signals = useMemo(
    () => (item ? strategy.signals(item.bars, activeParams) : []),
    [item, strategy, activeParams],
  );

  const capital = caps[market] ?? def.capital;

  const bt = useMemo(
    () =>
      item
        ? runBacktest(item.bars, item.meta, signals, {
            capital,
            sizePct,
            windowsPerDay: WINDOWS_PER_DAY,
            patient: def.rules.hasSpread ? patient : false,
            rules: def.rules,
            // A coin can be bought in fractions; a GE item cannot, so a stack under
            // one unit's price simply cannot trade it.
            wholeUnits: def.native !== 'usd',
          })
        : null,
    [item, signals, capital, sizePct, patient, def.rules],
  );

  const metrics = useMemo(
    () => (bt ? computeMetrics(bt.equity, bt.benchmark, bt.trades, bt.exposure, bt.taxPaid) : null),
    [bt],
  );

  const overlays = useMemo<Overlay[]>(() => {
    if (!item) return [];
    const c = closes(item.bars);
    const out: Overlay[] = [{ key: 'sma20', label: 'SMA 20', color: 'var(--amber)', data: sma(c, 20) }];
    if (item.bars.length > 60) {
      out.push({ key: 'sma50', label: 'SMA 50', color: 'var(--violet)', data: sma(c, 50) });
    }
    // 200 sessions of history is the price of a 200-day average: RS3 only ships 180.
    if (item.bars.length > 200) {
      out.push({ key: 'sma200', label: 'SMA 200', color: 'var(--accent)', data: sma(c, 200) });
    }
    return out;
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

  const goldRate = isGoldMarket(market) ? fxFor(fx, market) : null;
  const toUsd = (v: number) => (goldRate != null ? gpToUsd(v, goldRate) : NaN);

  const money = (v: number) => (def.native === 'gp' ? `${fmtGp(v)} gp` : fmtUsd(v));
  const moneyShort = (v: number) => (def.native === 'gp' ? `${fmtGpShort(v)} gp` : fmtUsdShort(v));
  const signed = (v: number) =>
    def.native === 'gp'
      ? (v >= 0 ? '+' : '-') + fmtGp(Math.abs(v)) + ' gp'
      : (v >= 0 ? '+$' : '-$') + fmtUsd(Math.abs(v)).slice(1);

  const sources = [
    { label: def.venue, live: active?.source === 'live' },
    ...(nfts?.length ? [{ label: 'CoinGecko NFT', live: true }] : []),
  ];

  if (market === 'collectibles') {
    return (
      <div className="app">
        <MarketBar market={market} onMarket={setMarket} rate={null} sources={sources} />
        <MasterList
          osrs={osrs?.items ?? null}
          rs3={rs3?.items ?? null}
          crypto={crypto?.items ?? null}
          nfts={nfts}
          nftAsOf={nftAsOf}
          fx={fx}
        />
      </div>
    );
  }

  if (!active || !item || !bt || !metrics) {
    return (
      <div className="app">
        <MarketBar market={market} onMarket={setMarket} rate={goldRate} sources={sources} />
        <div className="boot">Loading the exchange…</div>
      </div>
    );
  }

  const bars = item.bars;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const mid = item.quote ? (item.quote.ask + item.quote.bid) / 2 : (last?.c ?? 0);
  const dayChange = prev ? mid / prev.c - 1 : 0;
  const ask = item.quote?.ask ?? last?.h ?? 0;
  const bid = item.quote?.bid ?? last?.l ?? 0;
  const spreadPct = bid > 0 ? (ask - bid) / bid : 0;
  const t = def.rules.tax;
  const tax = taxFor(def.rules, ask);
  const margin = ask - tax - bid;
  const costs = metrics.taxPaid + bt.feesPaid;

  const filtered = items.filter((i) => i.meta.name.toLowerCase().includes(query.trim().toLowerCase()));
  const lastSignal = signals[signals.length - 1] === 1 ? 'long' : 'flat';
  /** The engine closes a still-open position on the last bar and tags that trade. */
  const closedAtEnd = bt.trades[bt.trades.length - 1]?.reason === 'end of sample';
  const usdNote = goldRate != null ? `${fmtUsd(toUsd(metrics.finalEquity))} at your rate` : undefined;
  const taxLabel = t ? 'GE tax' : 'Fee';
  const noTrades = metrics.tradeCount === 0;
  /** A curve that never moves has no ratio to report: none of these are zero, they are absent. */
  const flat = metrics.vol === 0;
  const pnlUsd =
    def.native === 'usd'
      ? fmtUsd(metrics.finalEquity - capital)
      : goldRate != null
        ? fmtUsd(toUsd(metrics.finalEquity - capital))
        : undefined;
  const calmar = metrics.maxDD === 0 ? (metrics.cagr > 0 ? '∞' : '—') : fmtNum(metrics.calmar);
  /** A stack that cannot buy one unit has no buy-and-hold return, only cash. */
  const canAfford = bt.benchUnits > 0;

  const rows: MetricRow[] = [
    {
      label: def.native === 'gp' ? 'Final stack' : 'Final equity',
      value: money(metrics.finalEquity),
      tone: metrics.finalEquity >= capital ? 'pos' : 'neg',
      note: usdNote,
    },
    {
      label: 'Total return',
      value: fmtSignedPct(metrics.totalReturn),
      tone: metrics.totalReturn >= 0 ? 'pos' : 'neg',
      note: pnlUsd,
    },
    { label: 'CAGR', value: fmtPct(metrics.cagr), tone: metrics.cagr >= 0 ? 'pos' : 'neg' },
    {
      label: 'Sharpe',
      value: flat ? '—' : fmtNum(metrics.sharpe),
      note: flat ? 'no price movement' : '365-day year',
    },
    { label: 'Sortino', value: flat ? '—' : fmtNum(metrics.sortino) },
    {
      label: 'Max drawdown',
      value: fmtPct(metrics.maxDD),
      tone: 'neg',
      note:
        def.native === 'usd'
          ? fmtUsd(metrics.maxDDPeak * metrics.maxDD)
          : goldRate != null
            ? fmtUsd(toUsd(metrics.maxDDPeak * metrics.maxDD))
            : `${metrics.maxDDDays.toFixed(0)}d deep`,
    },
    { label: 'Calmar', value: calmar },
    { label: 'Volatility', value: fmtPct(metrics.vol, 0) },
    {
      label: 'Win rate',
      value: noTrades ? '—' : fmtPct(metrics.winRate, 0),
      note: noTrades ? 'no closed trades' : `${metrics.tradeCount} closed`,
    },
    {
      label: 'Profit factor',
      value: noTrades ? '—' : metrics.profitFactor >= 99 ? '∞' : fmtNum(metrics.profitFactor),
      tone: noTrades ? undefined : metrics.profitFactor >= 1 ? 'pos' : 'neg',
    },
    { label: 'Avg hold', value: noTrades ? '—' : `${metrics.avgBarsHeld.toFixed(0)} d` },
    { label: 'Time in market', value: fmtPct(metrics.exposure, 0) },
    {
      label: t ? 'GE tax paid' : 'Fees paid',
      value: moneyShort(costs),
      tone: 'neg',
      note: goldRate != null ? fmtUsd(toUsd(costs)) : undefined,
    },
    { label: 'Best day', value: fmtPct(metrics.bestDay), tone: 'pos' },
    { label: 'Worst day', value: fmtPct(metrics.worstDay), tone: 'neg' },
    {
      label: 'Buy & hold',
      value: canAfford ? fmtSignedPct(metrics.benchReturn) : '—',
      note: canAfford
        ? `Sharpe ${fmtNum(metrics.benchSharpe)} · DD ${fmtPct(metrics.benchMaxDD)}`
        : 'stack under one unit',
      tone: canAfford ? (metrics.benchReturn >= 0 ? 'pos' : 'neg') : undefined,
    },
  ];

  return (
    <div className="app">
      <MarketBar market={market} onMarket={setMarket} rate={goldRate} sources={sources} />

      <aside className="sidebar">
        <div className="brand">
          {market === 'osrs' ? 'GE' : market === 'rs3' ? 'RS3' : 'SPOT'}
          <span>TERMINAL</span>
        </div>
        <div className="side-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={market === 'crypto' ? 'Search coins' : 'Search items'}
            aria-label="Search items"
          />
        </div>
        <ul className="item-list">
          {filtered.map((it) => {
            const b = it.bars[it.bars.length - 1];
            const p = it.bars[it.bars.length - 2];
            const px = it.quote ? (it.quote.ask + it.quote.bid) / 2 : b.c;
            const chg = p && p.c > 0 ? px / p.c - 1 : 0;
            return (
              <li
                key={it.meta.id}
                className={it.meta.id === item.meta.id ? 'sel' : ''}
                onClick={() => pick(it.meta.id)}
              >
                <span className="item-name">{it.meta.name}</span>
                <span className="mono item-px">
                  {def.native === 'gp' ? fmtGpShort(px) : fmtUsdShort(px)}
                </span>
                <span className="mono item-usd">{goldRate != null ? fmtUsd(gpToUsd(px, goldRate)) : ''}</span>
                <span className={`mono ${chg >= 0 ? 'pos' : 'neg'}`}>{fmtSignedPct(chg, 1)}</span>
              </li>
            );
          })}
        </ul>
        <div className="side-foot">
          <span className={active.source === 'live' ? 'dot live' : 'dot'} />
          {active.source === 'live' ? 'live quotes' : 'snapshot'}
          <br />
          series to {fmtDate(active.asOf)}
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
              <span>{def.native === 'gp' ? 'Mid' : 'Price'}</span>
              <b className="mono">{money(mid)}</b>
            </div>
            {goldRate != null && (
              <div className="q">
                <span>USD</span>
                <b className="mono accent">{fmtUsd(toUsd(mid))}</b>
              </div>
            )}
            <div className="q">
              <span>Day</span>
              <b className={`mono ${dayChange >= 0 ? 'pos' : 'neg'}`}>{fmtSignedPct(dayChange)}</b>
            </div>
            {def.rules.hasSpread && (
              <>
                <div className="q">
                  <span>Ask</span>
                  <b className="mono">{money(ask)}</b>
                </div>
                <div className="q">
                  <span>Bid</span>
                  <b className="mono">{money(bid)}</b>
                </div>
                <div className="q">
                  <span>Spread</span>
                  <b className="mono dim">{fmtPct(spreadPct, 1)}</b>
                </div>
              </>
            )}
            {t && (
              <div className="q">
                <span>Margin after tax</span>
                <b className={`mono ${margin >= 0 ? 'pos' : 'neg'}`}>{money(margin)}</b>
              </div>
            )}
            {item.meta.limit > 0 && (
              <div className="q">
                <span>Buy limit</span>
                <b className="mono dim">{fmtGp(item.meta.limit)} / 4h</b>
              </div>
            )}
            {def.rules.feeBps > 0 && (
              <div className="q">
                <span>Round-trip cost</span>
                <b className="mono dim">{fmtPct((def.rules.feeBps * 2) / 10_000)}</b>
              </div>
            )}
            {last.v > 0 && (
              <div className="q">
                <span>{market === 'crypto' ? '24h volume' : 'Volume'}</span>
                <b className="mono dim">{def.native === 'gp' ? fmtGpShort(last.v) : fmtUsdShort(last.v)}</b>
              </div>
            )}
          </div>
        </header>

        <section className="panel chart-panel">
          <div className="panel-head">
            <h3>
              {market === 'crypto' ? 'Daily close' : 'Daily mid'}{' '}
              <span className="dim">· {bars.length} bars</span>
            </h3>
            <div className="chart-actions">
              <button className={logScale ? 'on' : ''} onClick={() => setLogScale((v) => !v)}>
                log
              </button>
            </div>
          </div>
          <PriceChart bars={bars} overlays={overlays} trades={bt.trades} logScale={logScale} />
          <p className="chart-note">
            {def.rules.hasSpread
              ? 'One candle is one day: the wick is the range this item actually traded between (average instant-sell to average instant-buy), the body is the move in the mid.'
              : `One candle is one day and opens where the last one closed, because ${def.venue} publishes a single daily price with no intraday range.`}{' '}
            Wheel to zoom, drag to pan, double-click to reset.
          </p>
        </section>

        <nav className="tabs">
          {TABS.map((tb) => (
            <button key={tb.id} className={tab === tb.id ? 'on' : ''} onClick={() => setTab(tb.id)}>
              {tb.label}
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
                {bt.trades.length} closed · {moneyShort(costs)} in costs
              </span>
            </div>
            <TradesTable
              trades={bt.trades}
              money={money}
              signed={signed}
              usd={goldRate != null ? (v) => fmtUsd(toUsd(v)) : null}
              taxLabel={taxLabel}
            />
            <p className="chart-note">{def.fillNote}</p>
          </section>
        )}

        {tab === 'market' && (
          <section className="panel">
            <div className="panel-head">
              <h3>{market === 'crypto' ? 'Cross-section' : 'Margin scanner'}</h3>
              <span className="panel-note">click a row to load it</span>
            </div>
            <FlipTable
              items={items}
              selectedId={item.meta.id}
              onSelect={pick}
              rules={def.rules}
              usdPerM={goldRate}
              native={def.native}
            />
            <p className="chart-note">
              {def.rules.hasSpread
                ? 'Margin is what one unit nets if it is bought at the day’s bid and sold at the day’s ask after tax — two resting offers. Crossing on both sides costs you the spread, which is what the backtest charges by default.'
                : `One price per unit means there is no margin to scan: the only cost is ${def.rules.feeBps > 0 ? `${fmtPct(def.rules.feeBps / 10_000)} a side` : 'nothing at all'}, which shows up as a negative margin.`}{' '}
              {def.rules.hasSpread && 'Capacity is the buy limit across six 4-hour windows at the ask.'}
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
          onCapital={(v) => setCaps((c) => ({ ...c, [market]: v }))}
          capitalStep={def.capitalStep}
          capitalLabel={def.unitLabel}
          minCapital={def.capitalStep}
          formatCapital={moneyShort}
          sizePct={sizePct}
          onSizePct={setSizePct}
          patient={patient}
          onPatient={setPatient}
          hasSpread={def.rules.hasSpread}
          fillNote={def.fillNote}
          limitNote={
            item.meta.limit > 0
              ? `The buy limit caps it further: ${fmtGp(item.meta.limit)} every 4 hours, so the quantity is also limited to that times six.`
              : null
          }
        />

        {goldRate != null && (
          <FxPanel market={market === 'rs3' ? 'rs3' : 'osrs'} fx={fx} patch={patchFx} reset={resetFx} />
        )}

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
            <b className="dim">{closedAtEnd ? 'sold at last close' : 'none'}</b>
          </div>
          <div className="kv">
            <span>Exposure</span>
            <b>{fmtPct(metrics.exposure, 0)}</b>
          </div>
          {goldRate != null && (
            <div className="kv">
              <span>Final in USD</span>
              <b className="pos">{fmtUsd(toUsd(metrics.finalEquity))}</b>
            </div>
          )}
        </section>

        <section className="panel-block">
          <h4>What this is</h4>
          <p className="blurb">
            {market === 'crypto'
              ? 'A one-asset backtester on spot closes, not a portfolio and not a perp. No funding, no borrow, no liquidations — the only costs are two taker fees, which is why crypto results here look better than they would on an exchange with real fills.'
              : 'A one-item backtester, not a portfolio. You are either holding this item or holding cash, so the only question it answers is whether a rule beat the venue’s costs on this item over the sample.'}
          </p>
          <p className="blurb">
            Prices come from {def.venue}.{' '}
            {active.source === 'live' ? 'Live quotes loaded just now' : 'The bundled snapshot is showing'}
            ; the daily series is dated {fmtDate(active.asOf)}.
            {goldRate != null && ' Dollar figures multiply gp by the reference rate in the panel above.'}
          </p>
        </section>
      </aside>
    </div>
  );
}
