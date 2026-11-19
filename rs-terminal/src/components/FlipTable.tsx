import { useMemo } from 'react';
import type { Item } from '../types';
import { taxOn } from '../engine/backtest';
import { fmtGp, fmtGpShort, fmtPct, fmtSignedPct } from '../lib/format';

interface Props {
  items: Item[];
  selectedId: number;
  onSelect: (id: number) => void;
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

/** 4-hour windows in a day; the buy limit resets on that cycle. */
const WINDOWS = 6;

export function FlipTable({ items, selectedId, onSelect }: Props) {
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const it of items) {
      const bars = it.bars;
      if (bars.length < 2) continue;
      const last = bars[bars.length - 1];
      const ask = it.quote?.ask ?? last.h;
      const bid = it.quote?.bid ?? last.l;
      const mid = Math.round((ask + bid) / 2);
      if (!bid || !ask) continue;
      const tax = taxOn(ask);
      const margin = ask - tax - bid;

      const rets: number[] = [];
      for (let i = Math.max(1, bars.length - 30); i < bars.length; i++) {
        const prev = bars[i - 1].c;
        if (prev > 0) rets.push(bars[i].c / prev - 1);
      }
      const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
      const sd = rets.length > 1
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
        capacity: it.meta.limit * WINDOWS * ask,
        vol30: sd * Math.sqrt(365),
        limit: it.meta.limit,
      });
    }
    return out.sort((a, b) => b.roi - a.roi);
  }, [items]);

  return (
    <div className="table-wrap">
      <table className="flips">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Mid</th>
            <th className="num">Day</th>
            <th className="num">Spread</th>
            <th className="num">Margin/unit</th>
            <th className="num">ROI</th>
            <th className="num">Limit</th>
            <th className="num">Daily vol</th>
            <th className="num">Capacity</th>
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
              <td className="num mono">{fmtGp(r.mid)}</td>
              <td className={`num mono ${r.dayChange >= 0 ? 'pos' : 'neg'}`}>{fmtSignedPct(r.dayChange)}</td>
              <td className="num mono dim">{fmtPct(r.spreadPct, 1)}</td>
              <td className={`num mono ${r.margin >= 0 ? 'pos' : 'neg'}`}>{fmtGp(r.margin)}</td>
              <td className={`num mono ${r.roi >= 0 ? 'pos' : 'neg'}`}>{fmtPct(r.roi)}</td>
              <td className="num mono dim">{fmtGp(r.limit)}</td>
              <td className="num mono dim">{fmtGpShort(r.volume)}</td>
              <td className="num mono dim">{fmtGpShort(r.capacity)}</td>
              <td className="num mono dim">{fmtPct(r.vol30, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
