import { useState } from 'react';
import type { Trade } from '../types';
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice, fmtSignedMoney } from '../lib/format';

type SortKey = 'entryT' | 'pnl' | 'ret' | 'barsHeld' | 'mae';

export function TradesTable({ trades }: { trades: Trade[] }) {
  const [sort, setSort] = useState<SortKey>('entryT');
  const [dir, setDir] = useState<1 | -1>(-1);

  const sorted = trades.slice().sort((a, b) => {
    const av = a[sort] as number;
    const bv = b[sort] as number;
    return (av - bv) * dir;
  });

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const totalCost = trades.reduce((s, t) => s + t.costs, 0);

  const head = (key: SortKey, label: string, align = 'right') => (
    <th
      className={`num ${sort === key ? 'sorted' : ''}`}
      style={{ textAlign: align as any }}
      onClick={() => {
        if (sort === key) setDir((d) => (d === 1 ? -1 : 1));
        else {
          setSort(key);
          setDir(-1);
        }
      }}
    >
      {label}
      {sort === key ? (dir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  );

  if (!trades.length) {
    return <div className="empty-state">No trades. Loosen the entry conditions or extend the sample.</div>;
  }

  return (
    <div className="trades-wrap">
      <div className="trades-summary">
        <span>
          <b>{trades.length}</b> closed legs
        </span>
        <span>
          net <b className={totalPnl >= 0 ? 'pos' : 'neg'}>{fmtSignedMoney(totalPnl)}</b>
        </span>
        <span>
          costs <b>{fmtMoney(totalCost)}</b>
        </span>
        <span>
          avg hold <b>{fmtNum(trades.reduce((s, t) => s + t.barsHeld, 0) / trades.length, 0)}</b> bars
        </span>
        <span className="hint">click a column to sort</span>
      </div>
      <div className="table-scroll">
        <table className="data-table trades-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Side</th>
              {head('entryT', 'Entry', 'left')}
              <th className="num">Entry px</th>
              <th>Exit</th>
              <th className="num">Exit px</th>
              <th className="num">Qty</th>
              {head('pnl', 'P&L')}
              {head('ret', 'Return')}
              {head('barsHeld', 'Bars')}
              {head('mae', 'MAE')}
              <th className="num">MFE</th>
              <th>Exit reason</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, idx) => (
              <tr key={`${t.entryT}-${idx}`}>
                <td className="dim">{idx + 1}</td>
                <td>
                  <span className={`side-pill ${t.side}`}>{t.side}</span>
                </td>
                <td className="mono">{fmtDate(t.entryT)}</td>
                <td className="num mono">{fmtPrice(t.entryPx)}</td>
                <td className="mono">{fmtDate(t.exitT)}</td>
                <td className="num mono">{fmtPrice(t.exitPx)}</td>
                <td className="num mono">{fmtNum(t.qty, 0)}</td>
                <td className={`num mono ${t.pnl >= 0 ? 'pos' : 'neg'}`}>{fmtSignedMoney(t.pnl)}</td>
                <td className={`num mono ${t.ret >= 0 ? 'pos' : 'neg'}`}>{fmtPct(t.ret)}</td>
                <td className="num mono">{t.barsHeld}</td>
                <td className="num mono neg">{fmtPct(t.mae, 1)}</td>
                <td className="num mono pos">{fmtPct(t.mfe, 1)}</td>
                <td className="dim">{t.exitReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
