import type { Bar, EquityPoint, ItemMeta, Trade } from '../types';
import type { Signal } from './strategies';

/** Grand Exchange tax: 2% of the sale, floored per item, capped, nothing under 50 gp. */
export const GE_TAX = { rate: 0.02, cap: 5_000_000, exemptBelow: 50 } as const;

export function taxOn(salePrice: number): number {
  if (!Number.isFinite(salePrice) || salePrice < GE_TAX.exemptBelow) return 0;
  return Math.min(Math.floor(salePrice * GE_TAX.rate), GE_TAX.cap);
}

export interface Options {
  capital: number;
  /** Fraction of cash deployed per entry. */
  sizePct: number;
  /** 4-hour buy-limit windows inside one daily bar. */
  windowsPerDay: number;
  /**
   * false (default): cross the spread both ways — buy at the ask, sell at the bid.
   * true: assume a resting offer fills at the day's average bid/ask, which is the
   * optimistic case and is labelled as such in the UI.
   */
  patient: boolean;
}

export interface BacktestResult {
  equity: EquityPoint[];
  benchmark: EquityPoint[];
  trades: Trade[];
  exposure: number[];
  taxPaid: number;
  openQty: number;
  openValue: number;
}

/**
 * Long-or-gp loop. A signal read on bar i's close fills at bar i+1's average
 * instant-buy price (h) on entry and instant-sell price (l) on exit, so every
 * round trip pays the spread and the tax. Equity marks a held position at the
 * bid, i.e. what it would fetch if liquidated on that bar.
 */
export function runBacktest(
  bars: Bar[],
  meta: ItemMeta,
  signals: Signal[],
  opts: Options,
): BacktestResult {
  const equity: EquityPoint[] = [];
  const benchmark: EquityPoint[] = [];
  const trades: Trade[] = [];
  const exposure: number[] = [];
  let taxPaid = 0;

  if (bars.length < 2) {
    return { equity, benchmark, trades, exposure, taxPaid, openQty: 0, openValue: 0 };
  }

  // Benchmark: buy on the first bar at the ask, mark at the bid for the rest.
  const benchUnits = Math.floor(opts.capital / bars[0].h);
  const benchCash = opts.capital - benchUnits * bars[0].h;

  let cash = opts.capital;
  let qty = 0;
  let entryPx = 0;
  let entryI = -1;

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const sig = signals[i - 1] ?? 0;

    if (qty === 0 && sig > 0) {
      const px = opts.patient ? bar.l : bar.h;
      const want = Math.floor((cash * opts.sizePct) / px);
      const limitCap = Math.floor(meta.limit * opts.windowsPerDay);
      const q = Math.max(0, Math.min(want, limitCap, Math.floor(cash / px)));
      if (q > 0) {
        cash -= q * px;
        qty = q;
        entryPx = px;
        entryI = i;
      }
    } else if (qty > 0 && sig < 0) {
      const bid = opts.patient ? bar.h : bar.l;
      const gross = qty * bid;
      const tax = taxOn(bid) * qty;
      cash += gross - tax;
      taxPaid += tax;
      trades.push({
        entryI,
        exitI: i,
        entryT: bars[entryI].t,
        exitT: bar.t,
        entryPx,
        exitPx: bid,
        qty,
        gross,
        tax,
        pnl: gross - tax - qty * entryPx,
        ret: bid / entryPx - 1,
        barsHeld: i - entryI,
        reason: 'signal',
      });
      qty = 0;
      entryI = -1;
    }

    const mark = qty > 0 ? qty * bar.l : 0;
    equity.push({ t: bar.t, v: cash + mark });
    exposure.push(qty > 0 ? 1 : 0);
    benchmark.push({ t: bar.t, v: benchCash + benchUnits * bar.l });
  }

  const last = bars[bars.length - 1];
  if (qty > 0) {
    const bid = opts.patient ? last.h : last.l;
    const gross = qty * bid;
    const tax = taxOn(bid) * qty;
    cash += gross - tax;
    taxPaid += tax;
    trades.push({
      entryI,
      exitI: bars.length - 1,
      entryT: bars[entryI].t,
      exitT: last.t,
      entryPx,
      exitPx: bid,
      qty,
      gross,
      tax,
      pnl: gross - tax - qty * entryPx,
      ret: bid / entryPx - 1,
      barsHeld: bars.length - 1 - entryI,
      reason: 'end of sample',
    });
    qty = 0;
  }

  return {
    equity,
    benchmark,
    trades,
    exposure,
    taxPaid,
    openQty: qty,
    openValue: cash,
  };
}
