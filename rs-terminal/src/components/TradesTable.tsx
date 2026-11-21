import type { Trade } from '../types';
import { fmtDate, fmtPct } from '../lib/format';

interface Props {
  trades: Trade[];
  /** Formats a quantity of the venue's native unit, unsigned. */
  money: (v: number) => string;
  /** Formats a profit and loss with an explicit sign. */
  signed: (v: number) => string;
  /** Extra column showing each trade in dollars, when the venue is priced in gp. */
  usd?: ((v: number) => string) | null;
  taxLabel: string;
}

export function TradesTable({ trades, money, signed, usd, taxLabel }: Props) {
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
            <th className="num">In</th>
            <th className="num">Out</th>
            <th className="num">{taxLabel}</th>
            <th className="num">Net</th>
            {usd && <th className="num">Net USD</th>}
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
              <td className="num mono">{t.qty.toLocaleString('en-US')}</td>
              <td className="num mono">{money(t.entryPx)}</td>
              <td className="num mono">{money(t.exitPx)}</td>
              <td className="num mono dim">{t.tax > 0 ? money(t.tax) : '—'}</td>
              <td className={`num mono ${t.pnl >= 0 ? 'pos' : 'neg'}`}>{signed(t.pnl)}</td>
              {usd && <td className="num mono dim">{usd(t.pnl)}</td>}
              <td className={`num mono ${t.ret >= 0 ? 'pos' : 'neg'}`}>{fmtPct(t.ret)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
