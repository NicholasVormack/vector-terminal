import type { BacktestOptions, Bar, EquityPoint, RunResult, Trade } from '../types';
import { closes } from './indicators';
import { computeMetrics } from './metrics';
import type { Strategy } from './strategies';

interface Leg {
  side: 1 | -1;
  entryI: number;
  entryT: number;
  entryPx: number;
  qty: number;
  maxQty: number;
  costBasis: number;
  peakNotional: number;
  realized: number;
  costs: number;
  mae: number;
  mfe: number;
  peakPx: number;
}

interface Point {
  i: number;
  t: number;
  v: number;
  exp: number;
}

/**
 * Event-driven, bar-by-bar backtester.
 *
 * Signals are evaluated on a completed bar and filled at the *next* open by
 * default, so the engine cannot peek at the bar it trades into. Fractional
 * shares are used so exposure targets are exact; commission and slippage are
 * charged on every fill, and stops are checked against the bar's true range
 * with gap-aware fills.
 */
export function runBacktest(
  bars: Bar[],
  strategy: Strategy,
  params: Record<string, number>,
  opts: BacktestOptions,
): RunResult {
  const n = bars.length;
  if (n < 3) {
    const flat: EquityPoint[] = n ? [{ t: bars[0].t, v: opts.initialCapital }] : [];
    return {
      equity: flat,
      benchmark: flat,
      trades: [],
      metrics: computeMetrics(flat, flat, [], [], 0),
      options: opts,
      bars,
      warmup: 0,
    };
  }

  const c = closes(bars);
  const strat = strategy.make(params, bars);
  const trades: Trade[] = [];
  const points: Point[] = [];

  let cash = opts.initialCapital;
  let pos = 0;
  let leg: Leg | null = null;
  let pending: number | null = null;
  let firstFill = -1;
  let turnover = 0;

  const closeLegNow = (px: number, i: number, reason: string) => {
    if (!leg) return;
    leg.realized += leg.qty * (px - leg.entryPx) * leg.side;
    const notional = Math.max(1e-9, leg.peakNotional);
    trades.push({
      side: leg.side > 0 ? 'long' : 'short',
      entryI: leg.entryI,
      entryT: leg.entryT,
      entryPx: leg.entryPx,
      exitI: i,
      exitT: bars[i].t,
      exitPx: px,
      qty: leg.maxQty,
      notional,
      pnl: leg.realized,
      ret: leg.realized / notional,
      costs: leg.costs,
      barsHeld: Math.max(1, i - leg.entryI),
      mae: leg.mae,
      mfe: leg.mfe,
      exitReason: reason,
    });
    leg = null;
  };

  const applyTarget = (target: number, refPx: number, i: number, reason: string) => {
    if (!(refPx > 0) || !Number.isFinite(refPx)) return;
    const eq = cash + pos * refPx;
    if (!(eq > 0)) return;
    const t = Math.max(opts.allowShort ? -1 : 0, Math.min(1, target));
    const desired = (t * eq) / refPx;
    const delta = desired - pos;
    const refNotional = Math.abs(delta) * refPx;
    if (refNotional < Math.max(0.01, eq * 1e-4)) return;

    const dir = delta > 0 ? 1 : -1;
    const fillPx = refPx * (1 + (dir * opts.slippageBps) / 1e4);
    const notional = Math.abs(delta) * fillPx;
    const commission = Math.max(opts.minCommission, (notional * opts.commissionBps) / 1e4);
    const slipCost = notional * (opts.slippageBps / 1e4);
    const newPos = pos + delta;

    if (leg && pos !== 0 && Math.sign(newPos) !== leg.side) {
      closeLegNow(fillPx, i, reason);
    } else if (leg && Math.abs(newPos) < Math.abs(pos)) {
      const reduced = Math.abs(delta);
      leg.realized += reduced * (fillPx - leg.entryPx) * leg.side;
      leg.qty -= reduced;
      leg.costBasis = leg.qty * leg.entryPx;
    }

    if (!leg && Math.abs(newPos) > 1e-9) {
      leg = {
        side: newPos > 0 ? 1 : -1,
        entryI: i,
        entryT: bars[i].t,
        entryPx: fillPx,
        qty: Math.abs(newPos),
        maxQty: Math.abs(newPos),
        costBasis: Math.abs(newPos) * fillPx,
        peakNotional: Math.abs(newPos) * fillPx,
        realized: 0,
        costs: 0,
        mae: 0,
        mfe: 0,
        peakPx: fillPx,
      };
      if (firstFill < 0) firstFill = i;
    } else if (leg && Math.sign(delta) === leg.side && Math.abs(newPos) > Math.abs(pos)) {
      const added = Math.abs(delta);
      leg.costBasis += added * fillPx;
      leg.qty += added;
      leg.maxQty = Math.max(leg.maxQty, leg.qty);
      leg.entryPx = leg.costBasis / leg.qty;
      leg.peakNotional = Math.max(leg.peakNotional, leg.costBasis);
    }

    if (leg) leg.costs += commission + slipCost;

    pos = newPos;
    cash -= delta * fillPx + commission;
    turnover += notional;
  };

  const checkStops = (i: number) => {
    if (!leg) return;
    const b = bars[i];
    let px: number | null = null;
    let reason = 'stop';

    if (leg.side > 0) {
      const hard = opts.stopLossPct > 0 ? leg.entryPx * (1 - opts.stopLossPct) : -Infinity;
      const trail = opts.trailingStopPct > 0 ? leg.peakPx * (1 - opts.trailingStopPct) : -Infinity;
      const stop = Math.max(hard, trail);
      const tp = opts.takeProfitPct > 0 ? leg.entryPx * (1 + opts.takeProfitPct) : Infinity;
      if (Number.isFinite(stop) && b.l <= stop) {
        px = Math.min(b.o, stop);
        reason = 'stop loss';
      } else if (Number.isFinite(tp) && b.h >= tp) {
        px = Math.max(b.o, tp);
        reason = 'take profit';
      }
    } else {
      const hard = opts.stopLossPct > 0 ? leg.entryPx * (1 + opts.stopLossPct) : Infinity;
      const trail = opts.trailingStopPct > 0 ? leg.peakPx * (1 + opts.trailingStopPct) : Infinity;
      const stop = Math.min(hard, trail);
      const tp = opts.takeProfitPct > 0 ? leg.entryPx * (1 - opts.takeProfitPct) : -Infinity;
      if (Number.isFinite(stop) && b.h >= stop) {
        px = Math.max(b.o, stop);
        reason = 'stop loss';
      } else if (Number.isFinite(tp) && b.l <= tp) {
        px = Math.min(b.o, tp);
        reason = 'take profit';
      }
    }
    if (px !== null) applyTarget(0, px, i, reason);
  };

  const updateExcursion = (b: Bar) => {
    if (!leg) return;
    if (leg.side > 0) {
      leg.peakPx = Math.max(leg.peakPx, b.h);
      leg.mae = Math.min(leg.mae, b.l / leg.entryPx - 1);
      leg.mfe = Math.max(leg.mfe, b.h / leg.entryPx - 1);
    } else {
      leg.peakPx = Math.min(leg.peakPx, b.l);
      leg.mae = Math.min(leg.mae, leg.entryPx / Math.max(1e-9, b.h) - 1);
      leg.mfe = Math.max(leg.mfe, leg.entryPx / Math.max(1e-9, b.l) - 1);
    }
  };

  for (let i = 0; i < n; i++) {
    const bar = bars[i];

    if (pending !== null && i > 0) {
      const target = pending;
      pending = null;
      applyTarget(target, bar.o, i, 'signal');
    }

    checkStops(i);

    const equityNow = cash + pos * bar.c;
    const sig = strat({ i, bar, bars, close: c, position: pos, equity: equityNow });
    if (sig !== null && Number.isFinite(sig)) {
      if (opts.fill === 'close') applyTarget(sig, bar.c, i, 'signal');
      else pending = sig;
    }

    updateExcursion(bar);

    const eq = cash + pos * bar.c;
    points.push({ i, t: bar.t, v: eq, exp: eq > 0 ? Math.abs(pos * bar.c) / eq : 0 });
  }

  if (pos !== 0) {
    applyTarget(0, bars[n - 1].c, n - 1, 'end of test');
    if (points.length) points[points.length - 1].v = cash;
  }

  const start = firstFill >= 0 ? firstFill : 0;
  const slice = points.slice(start);
  const equity: EquityPoint[] = slice.map((p) => ({ t: p.t, v: p.v }));
  const exposure = slice.map((p) => p.exp);

  const base = bars[start].c;
  const benchmark: EquityPoint[] = bars.slice(start).map((b) => ({ t: b.t, v: (opts.initialCapital * b.c) / base }));

  const metrics = computeMetrics(equity, benchmark, trades, exposure, turnover);

  return { equity, benchmark, trades, metrics, options: opts, bars, warmup: start };
}

/** Sharpe of an equity slice, used by the in-sample / out-of-sample sweep. */
export function sliceSharpe(points: EquityPoint[], rf = 0.02): number {
  if (points.length < 5) return 0;
  const rets: number[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].v > 0) rets.push(points[i].v / points[i - 1].v - 1);
  }
  if (rets.length < 4) return 0;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - m) * (b - m), 0) / (rets.length - 1);
  const sd = Math.sqrt(v);
  return sd > 0 ? ((m - rf / 252) / sd) * Math.sqrt(252) : 0;
}
