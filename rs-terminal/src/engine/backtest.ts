import type { Bar, EquityPoint, ItemMeta, MarketRules, Trade } from '../types';
import type { Signal } from './strategies';

/** Grand Exchange tax: 2% of the sale, floored per item, capped, nothing under 50 gp. */
export const GE_TAX = { rate: 0.02, cap: 5_000_000, exemptBelow: 50 } as const;

/** 4-hour buy-limit windows inside one daily bar. */
export const WINDOWS_PER_DAY = 6;

/** The venue's cut on one unit sold at this price. */
export function taxFor(rules: MarketRules, salePrice: number): number {
  const t = rules.tax;
  if (!t) return 0;
  if (!Number.isFinite(salePrice) || salePrice < t.exemptBelow) return 0;
  return Math.min(Math.floor(salePrice * t.rate), t.cap);
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
  /** Venue costs: tax, taker fee and whether the feed quotes a spread. */
  rules: MarketRules;
  /**
   * An item is indivisible, so a stack that cannot afford one unit cannot trade it.
   * A coin can be bought in fractions, so crypto sizes from capital without rounding
   * down to zero.
   */
  wholeUnits: boolean;
}

export interface BacktestResult {
  equity: EquityPoint[];
  benchmark: EquityPoint[];
  trades: Trade[];
  exposure: number[];
  taxPaid: number;
  /** Taker fees on both sides, kept apart from tax because venues charge one or the other. */
  feesPaid: number;
  /** Units the stack could buy on bar one; zero means the item is out of reach. */
  benchUnits: number;
}

/**
 * Long-or-cash loop. A signal read on bar i's close fills at bar i+1's average
 * instant-buy price (h) on entry and instant-sell price (l) on exit, so every
 * round trip pays the spread and the venue's cut. Equity marks a held position
 * at the bid, i.e. what it would fetch if liquidated on that bar.
 *
 * A venue that publishes one price per day (RS3, crypto) has no spread to cross,
 * so h === l there and the spread charge is zero by construction rather than
 * assumed away.
 */
export function runBacktest(
  bars: Bar[],
  meta: ItemMeta,
  signals: Signal[],
  opts: Options,
): BacktestResult {
  const rules = opts.rules;
  const fee = rules.feeBps / 10_000;
  const equity: EquityPoint[] = [];
  const benchmark: EquityPoint[] = [];
  const trades: Trade[] = [];
  const exposure: number[] = [];
  let taxPaid = 0;
  let feesPaid = 0;

  if (bars.length < 2) {
    return { equity, benchmark, trades, exposure, taxPaid, feesPaid, benchUnits: 0 };
  }

  /** Units a budget buys: whole items round down, coins do not round at all. */
  const units = (budget: number, unitCost: number) => {
    if (!(unitCost > 0)) return 0;
    const raw = budget / unitCost;
    return opts.wholeUnits ? Math.floor(raw) : Math.max(0, raw);
  };

  // Benchmark: buy on the first bar at the ask, mark at the bid for the rest.
  const benchUnits = units(opts.capital, bars[0].h * (1 + fee));
  const benchCash = Math.max(0, opts.capital - benchUnits * bars[0].h * (1 + fee));

  let cash = opts.capital;
  let qty = 0;
  let entryPx = 0;
  let entryI = -1;

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const sig = signals[i - 1] ?? 0;

    if (qty === 0 && sig > 0) {
      const px = opts.patient ? bar.l : bar.h;
      const unitCost = px * (1 + fee);
      const want = units(cash * opts.sizePct, unitCost);
      const limitCap = meta.limit > 0 ? Math.floor(meta.limit * opts.windowsPerDay) : Infinity;
      const q = Math.max(0, Math.min(want, limitCap, units(cash, unitCost)));
      if (q > 0) {
        cash = Math.max(0, cash - q * unitCost);
        feesPaid += q * px * fee;
        qty = q;
        entryPx = unitCost;
        entryI = i;
      }
    } else if (qty > 0 && sig < 0) {
      const bid = opts.patient ? bar.h : bar.l;
      const gross = qty * bid;
      const tax = taxFor(rules, bid) * qty;
      cash += gross - gross * fee - tax;
      taxPaid += tax;
      feesPaid += gross * fee;
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
        pnl: gross - gross * fee - tax - qty * entryPx,
        ret: (bid * (1 - fee)) / entryPx - 1,
        barsHeld: i - entryI,
        reason: 'signal',
      });
      qty = 0;
      entryI = -1;
    }

    const mark = qty > 0 ? qty * bar.l * (1 - fee) : 0;
    equity.push({ t: bar.t, v: cash + mark });
    exposure.push(qty > 0 ? 1 : 0);
    benchmark.push({ t: bar.t, v: benchCash + benchUnits * bar.l * (1 - fee) });
  }

  const last = bars[bars.length - 1];
  if (qty > 0) {
    const bid = opts.patient ? last.h : last.l;
    const gross = qty * bid;
    const tax = taxFor(rules, bid) * qty;
    cash += gross - gross * fee - tax;
    taxPaid += tax;
    feesPaid += gross * fee;
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
      pnl: gross - gross * fee - tax - qty * entryPx,
      ret: (bid * (1 - fee)) / entryPx - 1,
      barsHeld: bars.length - 1 - entryI,
      reason: 'end of sample',
    });
  }

  return { equity, benchmark, trades, exposure, taxPaid, feesPaid, benchUnits };
}
