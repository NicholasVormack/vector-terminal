import type { Trade } from '../types';
import { fmtDate, fmtGp, fmtPct, fmtSignedGp } from '../lib/format';

export function TradesTable({ trades }: { trades: Trade[] }) {
  if (!trades.length) {
    return (
      <div className="empty">
        No trades closed. The strategy never held a position it could exit at a price the market actually
        traded.
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="trades">
        <thead>
          <tr>
            <th>#</th>
            <th>Buy</th>
            <th>Sell</th>
            <th className="num">Days</th>
            <th className="num">Qty</th>
            <th className="num">Buy gp</th>
            <th className="num">Sell gp</th>
            <th className="num">Tax</th>
            <th className="num">Net</th>
            <th className="num">Return</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => (
            <tr key={`${t.entryI}-${t.exitI}`}>
              <td className="dim mono">{String(i + 1).padStart(2, '0')}</td>
              <td>{fmtDate(t.entryT)}</td>
              <td>
                {fmtDate(t.exitT)}
                {t.reason === 'end of sample' && <span className="flag">EOS</span>}
              </td>
              <td className="num mono">{t.barsHeld}</td>
              <td className="num mono">{fmtGp(t.qty)}</td>
              <td className="num mono">{fmtGp(t.entryPx)}</td>
              <td className="num mono">{fmtGp(t.exitPx)}</td>
              <td className="num mono dim">{fmtGp(t.tax)}</td>
              <td className={`num mono ${t.pnl >= 0 ? 'pos' : 'neg'}`}>{fmtSignedGp(t.pnl)}</td>
              <td className={`num mono ${t.ret >= 0 ? 'pos' : 'neg'}`}>{fmtPct(t.ret)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
