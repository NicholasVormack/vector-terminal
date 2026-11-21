import { useMemo, useState } from 'react';
import type { Item } from '../types';
import type { FxConfig } from '../data/fx';
import { gpToUsd, usdToGp } from '../data/fx';
import type { Category, NftRow } from '../data/collectibles';
import {
  CATEGORIES,
  buildMasterRows,
  parseFeed,
  refreshNftFloor,
  useOverrides,
} from '../data/collectibles';
import { fmtDate, fmtGpShort, fmtPct, fmtPriceUsd, fmtSignedPct, fmtUsd } from '../lib/format';

interface Props {
  osrs: Item[] | null;
  rs3: Item[] | null;
  crypto: Item[] | null;
  nfts: NftRow[] | null;
  nftAsOf: number | null;
  fx: FxConfig;
}

type SortKey = 'name' | 'usd' | 'chg24' | 'chg30' | 'category';

export function MasterList({ osrs, rs3, crypto, nfts, nftAsOf, fx }: Props) {
  const { overrides, setMark } = useOverrides();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'usd', dir: -1 });
  const [feed, setFeed] = useState('');
  const [feedNote, setFeedNote] = useState('');
  const [floors, setFloors] = useState<NftRow[] | null>(nfts);
  const [refreshing, setRefreshing] = useState(false);

  const rows = useMemo(
    () => buildMasterRows({ osrs, rs3, crypto, nfts: floors, overrides }),
    [osrs, rs3, crypto, floors, overrides],
  );

  const usdOf = (row: { priceKind: 'gp' | 'usd'; native: number | null; category: Category }) => {
    if (row.native == null) return NaN;
    if (row.priceKind === 'usd') return row.native;
    return gpToUsd(row.native, row.category === 'rs3' ? fx.rs3UsdPerM : fx.osrsUsdPerM);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (cat !== 'all' && r.category !== cat) return false;
      if (!q) return true;
      return (r.name + ' ' + r.detail + ' ' + r.category + ' ' + r.source).toLowerCase().includes(q);
    });
    const order = CATEGORIES.map((c) => c.id);
    return filtered.sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * sort.dir;
      if (sort.key === 'category') {
        return (order.indexOf(a.category) - order.indexOf(b.category)) * sort.dir;
      }
      const av = sort.key === 'usd' ? usdOf(a) : ((a[sort.key] ?? -Infinity) as number);
      const bv = sort.key === 'usd' ? usdOf(b) : ((b[sort.key] ?? -Infinity) as number);
      if (!Number.isFinite(av)) return 1;
      if (!Number.isFinite(bv)) return -1;
      return (av - bv) * sort.dir;
    });
  }, [rows, query, cat, sort, fx]);

  const liveCount = rows.filter((r) => r.live).length;
  const markedCount = rows.filter((r) => r.native != null).length;
  const totalUsd = rows.reduce((s, r) => {
    const v = usdOf(r);
    return Number.isFinite(v) ? s + v : s;
  }, 0);

  const head = (key: SortKey, label: string, numeric = false) => (
    <th
      className={numeric ? 'num' : ''}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === -1 ? 1 : -1) : -1 }))}
    >
      {label}
      {sort.key === key && <em className="sort-arrow">{sort.dir === -1 ? '↓' : '↑'}</em>}
    </th>
  );

  async function refreshFloors() {
    if (!floors?.length) return;
    setRefreshing(true);
    const next = [...floors];
    for (let i = 0; i < next.length; i++) {
      const fresh = await refreshNftFloor(next[i].slug);
      if (fresh) next[i] = fresh;
      setFloors([...next]);
      // The free tier counts calls: a slow walk beats eight parallel 429s.
      await new Promise((r) => setTimeout(r, 1600));
    }
    setRefreshing(false);
  }

  function applyFeed() {
    const parsed = parseFeed(feed);
    if (!parsed.length) {
      setFeedNote('No rows parsed. Expected one per line: name, price.');
      return;
    }
    let hits = 0;
    for (const p of parsed) {
      const target = rows.find(
        (r) =>
          r.manual &&
          (r.name.toLowerCase().includes(p.name.toLowerCase()) ||
            p.name.toLowerCase().includes(r.name.toLowerCase())),
      );
      if (target) {
        setMark(target.id, p.usd);
        hits += 1;
      }
    }
    setFeedNote(`Parsed ${parsed.length} rows, matched ${hits}. The rest had no row to land on.`);
  }

  return (
    <main className="master">
      <div className="master-head">
        <div>
          <h1>Master list</h1>
          <p className="master-sub">
            Every market this terminal watches, in dollars, with the provenance of each number attached. Rows
            without a public feed are yours to price.
          </p>
        </div>
        <div className="master-stats">
          <div>
            <span>Rows</span>
            <b className="mono">{rows.length}</b>
          </div>
          <div>
            <span>From a feed</span>
            <b className="mono">{liveCount}</b>
          </div>
          <div>
            <span>Priced</span>
            <b className="mono">
              {markedCount}/{rows.length}
            </b>
          </div>
          <div>
            <span>Sum of marks</span>
            <b className="mono">{fmtUsd(totalUsd)}</b>
          </div>
        </div>
      </div>

      <div className="master-controls">
        <input
          className="master-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every market — charizard, onyx, eth, littlest pet shop…"
          aria-label="Search the master list"
        />
        <div className="chips">
          <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
            all <em>{rows.length}</em>
          </button>
          {CATEGORIES.map((c) => {
            const n = rows.filter((r) => r.category === c.id).length;
            return (
              <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
                {c.label} <em>{n}</em>
              </button>
            );
          })}
        </div>
      </div>

      <div className="table-wrap master-wrap">
        <table className="master-table">
          <thead>
            <tr>
              {head('name', 'Item')}
              <th>Where</th>
              <th className="num">Price</th>
              {head('usd', 'USD', true)}
              {head('chg24', '24h', true)}
              <th className="num">7d</th>
              {head('chg30', '30d', true)}
              <th>Source</th>
              <th className="num">Mark</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const usd = usdOf(r);
              // The price column only earns its width where the venue quotes in
              // something other than dollars: gp per item, ETH per floor.
              const price =
                r.native == null
                  ? '—'
                  : r.alt != null
                    ? `${r.alt.toFixed(2)} ${r.altUnit ?? ''}`.trim()
                    : r.priceKind === 'gp'
                      ? `${fmtGpShort(r.native)} gp`
                      : '—';
              return (
                <tr key={r.id} className={r.manual && r.native == null ? 'unpriced' : ''}>
                  <td>
                    <span className="m-name">{r.name}</span>
                    <span className="m-detail">{r.detail}</span>
                  </td>
                  <td>
                    <span className={`cat-tag cat-${r.category}`}>{r.category}</span>
                  </td>
                  <td className="num mono">{price}</td>
                  <td className={`num mono ${usd > 0 ? '' : 'dim'}`}>
                    {Number.isFinite(usd) ? (r.manual ? fmtPriceUsd(usd) : fmtUsd(usd)) : '—'}
                  </td>
                  <td className={`num mono ${r.chg24 == null ? 'dim' : r.chg24 >= 0 ? 'pos' : 'neg'}`}>
                    {r.chg24 == null ? '—' : fmtSignedPct(r.chg24, 1)}
                  </td>
                  <td className={`num mono ${r.chg7 == null ? 'dim' : r.chg7 >= 0 ? 'pos' : 'neg'}`}>
                    {r.chg7 == null ? '—' : fmtPct(r.chg7, 1)}
                  </td>
                  <td className={`num mono ${r.chg30 == null ? 'dim' : r.chg30 >= 0 ? 'pos' : 'neg'}`}>
                    {r.chg30 == null ? '—' : fmtPct(r.chg30, 1)}
                  </td>
                  <td className="dim m-source" title={r.asOf ? fmtDate(r.asOf) : 'no timestamp'}>
                    <i className={r.live ? 'dot live' : 'dot'} />
                    {r.source}
                  </td>
                  <td className="num">
                    <input
                      key={`${r.id}-${r.native ?? 'none'}`}
                      className="mark-input mono"
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={r.manual && r.native != null ? Number(r.native.toFixed(2)) : ''}
                      placeholder={r.manual ? 'set' : '—'}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        setMark(r.id, v === '' ? null : Number(v));
                      }}
                    />
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={9} className="empty">
                  Nothing matches. The list covers {rows.length} rows across {CATEGORIES.length} markets.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="master-foot">
        <section className="panel master-panel">
          <div className="panel-head">
            <h3>Marketplace feed</h3>
            <span className="panel-note">paste rows from any listing page</span>
          </div>
          <p className="chart-note">
            Eldorado has no public buyer API — its seller API needs 50 verified sales and covers your own offers
            only — and G2G publishes none at all. PlayerAuctions gates even its offer queries behind an HMAC-signed
            seller key. So rather than ship a scraper that breaks on their next deploy, this takes the rows you
            can already see: <code>OSRS gold, 0.19</code> per line, tab or comma separated.
          </p>
          <textarea
            className="feed-box"
            value={feed}
            onChange={(e) => setFeed(e.target.value)}
            placeholder={'OSRS gold\t0.19\nRS3 gold\t0.04\nWoW gold\t0.31'}
            rows={4}
          />
          <div className="row-btns">
            <button className="btn sm" onClick={applyFeed} disabled={!feed.trim()}>
              Apply to master list
            </button>
            <button className="link-btn" onClick={() => setFeed('')}>
              clear
            </button>
          </div>
          {feedNote && <p className="dim small">{feedNote}</p>}
        </section>

        <section className="panel master-panel">
          <div className="panel-head">
            <h3>NFT floors</h3>
            <span className="panel-note">
              {nftAsOf ? `snapshot ${fmtDate(nftAsOf)}` : 'no snapshot'}
            </span>
          </div>
          <p className="chart-note">
            CoinGecko NFT, walked one collection at a time because the free tier counts calls. Floor is the
            cheapest ask, not a sale — a collection can have a 9,000 dollar floor and no sale for a week.
          </p>
          <button className="btn sm" onClick={refreshFloors} disabled={refreshing || !floors?.length}>
            {refreshing ? 'Refreshing…' : 'Refresh floors'}
          </button>
        </section>

        <section className="panel master-panel">
          <div className="panel-head">
            <h3>Provenance</h3>
          </div>
          <ul className="prov">
            <li>
              <b>OSRS</b> OSRS Wiki prices API, mid of the last quote.
            </li>
            <li>
              <b>RS3</b> Jagex itemdb, one price a day, snapshot at build.
            </li>
            <li>
              <b>Crypto</b> CoinGecko spot, to the cent above a dollar and to significant figures below one.
            </li>
            <li>
              <b>NFT</b> CoinGecko NFT floor, ETH and USD.
            </li>
            <li>
              <b>Cards, toys, gold</b> your marks, stored in this browser, dated when entered.
            </li>
          </ul>
          <p className="chart-note">
            Gold rows are quoted per million so they compare like for like. {fmtUsd(1)} buys roughly{' '}
            {Number.isFinite(usdToGp(1, fx.osrsUsdPerM)) ? fmtGpShort(usdToGp(1, fx.osrsUsdPerM)) : '—'} gp at
            your OSRS rate.
          </p>
        </section>
      </div>
    </main>
  );
}
