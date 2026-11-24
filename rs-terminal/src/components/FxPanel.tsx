import type { FxConfig } from '../data/fx';
import { bondImpliedUsdPerM, fxFor } from '../data/fx';
import { fmtUsd } from '../lib/format';

interface Props {
  market: 'osrs' | 'rs3';
  fx: FxConfig;
  patch: (p: Partial<FxConfig>) => void;
  reset: () => void;
}

/**
 * The conversion is an input, so it gets a panel that shows its own working.
 *
 * The bond is the only sanctioned bridge between gp and dollars, which makes it
 * the only defensible anchor: divide the bond's price by its gp cost and you have
 * a number two public prices agree on. The defaults are a starting point, not a
 * quote, and the panel says so.
 */
export function FxPanel({ market, fx, patch, reset }: Props) {
  const rate = fxFor(fx, market);
  const setRate = (v: number) => patch(market === 'rs3' ? { rs3UsdPerM: v } : { osrsUsdPerM: v });
  const implied = bondImpliedUsdPerM(fx.bondGp, fx.bondUsd);

  return (
    <section className="panel-block">
      <h4>USD conversion</h4>
      <div className="param-head">
        <label htmlFor="usd-per-m">USD per 1M gp</label>
        <input
          id="usd-per-m"
          className="param-num mono wide"
          type="number"
          min={0}
          step={0.001}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />
      </div>
      <p className="blurb">
        {fmtUsd(rate)} per million converts every gp figure on screen. No exchange publishes this rate: gold
        has a bond price and a private-trade price, and Jagex only sanctions the first.
      </p>

      <div className="fx-bond">
        <div className="param-head">
          <label htmlFor="bond-gp">Bond, gp</label>
          <input
            id="bond-gp"
            className="param-num mono wide"
            type="number"
            min={0}
            step={100_000}
            placeholder="e.g. 14000000"
            value={fx.bondGp || ''}
            onChange={(e) => patch({ bondGp: Number(e.target.value) })}
          />
        </div>
        <div className="param-head">
          <label htmlFor="bond-usd">Bond, USD</label>
          <input
            id="bond-usd"
            className="param-num mono wide"
            type="number"
            min={0}
            step={0.01}
            placeholder="e.g. 7.99"
            value={fx.bondUsd || ''}
            onChange={(e) => patch({ bondUsd: Number(e.target.value) })}
          />
        </div>
        <div className="kv">
          <span>Bond-implied</span>
          <b className={implied > 0 ? 'pos' : 'dim'}>{implied > 0 ? `${fmtUsd(implied)} / 1M` : '—'}</b>
        </div>
        <button
          className="btn sm wide"
          disabled={implied <= 0}
          onClick={() => patch({ osrsUsdPerM: implied })}
        >
          Use {market === 'rs3' ? 'for OSRS too' : 'bond rate'}
        </button>
      </div>

      <div className="row-btns">
        <button className="link-btn" onClick={reset}>
          reset to reference
        </button>
      </div>
    </section>
  );
}
