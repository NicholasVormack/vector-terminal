import { useMemo } from 'react';
import type { Item, MarketRules } from '../types';
import { WINDOWS_PER_DAY, taxFor } from '../engine/backtest';
import { fmtGp, fmtGpShort, fmtPct, fmtSignedPct, fmtUsd } from '../lib/format';
import { gpToUsd } from '../data/fx';

interface Props {
  items: Item[];
  selectedId: number;
  onSelect: (id: number) => void;
  rules: MarketRules;
  /** Dollars per million gp, or null on a venue already priced in dollars. */
  usdPerM: number | null;
  /** What one unit is quoted in. */
  native: 'gp' | 'usd';
}

interface Row {
  id: number;
  name: string;
  mid: number;
  dayChange: number;
  spreadPct: number;
  margin: number;
  roi: number;
  volume: number;
  capacity: number;
  vol30: number;
  limit: number;
}

export function FlipTable({ items, selectedId, onSelect, rules, usdPerM, native }: Props) {
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const it of items) {
      const bars = it.bars;
      if (bars.length < 2) continue;
      const last = bars[bars.length - 1];
      const ask = it.quote?.ask ?? last.h;
      const bid = it.quote?.bid ?? last.l;
      const mid = (ask + bid) / 2;
      if (!bid || !ask) continue;
      const tax = taxFor(rules, ask);
      const fee = ((ask + bid) * rules.feeBps) / 10_000;
      const margin = ask - tax - fee - bid;

      const rets: number[] = [];
      for (let i = Math.max(1, bars.length - 30); i < bars.length; i++) {
        const prev = bars[i - 1].c;
        if (prev > 0) rets.push(bars[i].c / prev - 1);
      }
      const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
      const sd =
        rets.length > 1
          ? Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1))
          : 0;

      out.push({
        id: it.meta.id,
        name: it.meta.name,
        mid,
        dayChange: last.c / bars[bars.length - 2].c - 1,
        spreadPct: (ask - bid) / mid,
        margin,
        roi: margin / bid,
        volume: last.v,
        // The buy limit resets every four hours, so a day holds six windows of it.
        capacity: it.meta.limit > 0 ? it.meta.limit * WINDOWS_PER_DAY * ask : NaN,
        vol30: sd * Math.sqrt(365),
        limit: it.meta.limit,
      });
    }
    return out.sort((a, b) => b.roi - a.roi);
  }, [items, rules]);

  const money = (v: number, short = false) =>
    native === 'gp' ? (short ? fmtGpShort(v) : fmtGp(v)) : fmtUsd(v);
  const hasLimit = rows.some((r) => r.limit > 0);
  const hasVolume = rows.some((r) => r.volume > 0);

  return (
    <div className="table-wrap">
      <table className="flips">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Mid</th>
            {usdPerM != null && <th className="num">USD</th>}
            <th className="num">Day</th>
            <th className="num">Spread</th>
            <th className="num">Margin/unit</th>
            <th className="num">ROI</th>
            {hasLimit && <th className="num">Limit</th>}
            {hasVolume && <th className="num">Daily vol</th>}
            {hasLimit && <th className="num">Capacity</th>}
            <th className="num">30d vol</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={r.id === selectedId ? 'selected' : ''}
              onClick={() => onSelect(r.id)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelect(r.id);
              }}
            >
              <td>{r.name}</td>
              <td className="num mono">{money(r.mid)}</td>
              {usdPerM != null && (
                <td className="num mono dim">{fmtUsd(gpToUsd(r.mid, usdPerM))}</td>
              )}
              <td className={`num mono ${r.dayChange >= 0 ? 'pos' : 'neg'}`}>
                {fmtSignedPct(r.dayChange)}
              </td>
              <td className="num mono dim">{fmtPct(r.spreadPct, 1)}</td>
              <td className={`num mono ${r.margin >= 0 ? 'pos' : 'neg'}`}>{money(r.margin)}</td>
              <td className={`num mono ${r.roi >= 0 ? 'pos' : 'neg'}`}>{fmtPct(r.roi)}</td>
              {hasLimit && (
                <td className="num mono dim">{r.limit > 0 ? fmtGp(r.limit) : '—'}</td>
              )}
              {hasVolume && (
                <td className="num mono dim">{r.volume > 0 ? money(r.volume, true) : '—'}</td>
              )}
              {hasLimit && (
                <td className="num mono dim">
                  {Number.isFinite(r.capacity) ? money(r.capacity, true) : '—'}
                </td>
              )}
              <td className="num mono dim">{fmtPct(r.vol30, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
