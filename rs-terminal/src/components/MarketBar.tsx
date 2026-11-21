import type { MarketId } from '../types';
import { MARKETS } from '../data/markets';
import { fmtUsd } from '../lib/format';

interface Props {
  market: MarketId;
  onMarket: (id: MarketId) => void;
  /** Dollars per million gp for the gold venues, or null on a USD market. */
  rate: number | null;
  sources: { label: string; live: boolean }[];
}

export function MarketBar({ market, onMarket, rate, sources }: Props) {
  return (
    <header className="market-bar">
      <div className="mb-brand">
        VECTOR<span>MARKETS</span>
      </div>
      <nav className="mb-tabs" aria-label="Market">
        {MARKETS.map((m) => (
          <button
            key={m.id}
            className={market === m.id ? 'on' : ''}
            onClick={() => onMarket(m.id)}
            title={m.venue}
          >
            {m.label}
            <em>{m.sub}</em>
          </button>
        ))}
      </nav>
      <div className="mb-right">
        {sources.map((s) => (
          <span key={s.label} className="mb-source">
            <i className={s.live ? 'dot live' : 'dot'} />
            {s.label}
          </span>
        ))}
        {rate != null && (
          <span className="mb-rate mono" title="Reference rate: every USD figure is multiplied by this">
            {fmtUsd(rate)} <em>/ 1M gp</em>
          </span>
        )}
      </div>
    </header>
  );
}
