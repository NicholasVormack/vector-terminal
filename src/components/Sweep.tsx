import { useMemo, useState } from 'react';
import type { BacktestOptions, Bar, EquityPoint } from '../types';
import { runBacktest, sliceSharpe } from '../engine/backtest';
import type { ParamDef, Strategy } from '../engine/strategies';
import { fmtNum, fmtPct } from '../lib/format';

interface Props {
  bars: Bar[];
  strategy: Strategy;
  params: Record<string, number>;
  options: BacktestOptions;
}

const STEPS = 5;

function gridValues(def: ParamDef): number[] {
  const [a, b] = def.sweep ?? [def.min, def.max];
  return Array.from({ length: STEPS }, (_, k) => {
    const v = a + ((b - a) * k) / (STEPS - 1);
    return def.integer ? Math.round(v) : Math.round(v * 100) / 100;
  });
}

const fmtParam = (def: ParamDef, v: number) => (def.integer ? String(v) : v.toFixed(2));

function cellStyle(s: number) {
  const a = Math.min(0.85, Math.abs(s) / 2.4);
  return { background: s >= 0 ? `rgba(46,230,168,${a * 0.45})` : `rgba(255,90,95,${a * 0.45})` };
}

interface Row {
  a: number;
  b: number;
  isSharpe: number;
  oosSharpe: number;
  oosRet: number;
  fullSharpe: number;
  trades: number;
}

export function Sweep({ bars, strategy, params, options }: Props) {
  const [token, setToken] = useState(0);
  const sweepable = strategy.params.filter((p) => p.sweep);

  const result = useMemo(() => {
    if (!token || sweepable.length < 2 || bars.length < 200) return null;
    const p1 = sweepable[0];
    const p2 = sweepable[1];
    const v1 = gridValues(p1);
    const v2 = gridValues(p2);
    const splitT = bars[Math.floor(bars.length * 0.7)].t;
    const rows: Row[] = [];

    for (const a of v1) {
      for (const b of v2) {
        const run = runBacktest(bars, strategy, { ...params, [p1.key]: a, [p2.key]: b }, options);
        const is = run.equity.filter((p: EquityPoint) => p.t < splitT);
        const oos = run.equity.filter((p: EquityPoint) => p.t >= splitT);
        const oosStart = oos.length ? oos[0].v : 1;
        rows.push({
          a,
          b,
          isSharpe: sliceSharpe(is),
          oosSharpe: sliceSharpe(oos),
          oosRet: oos.length ? oos[oos.length - 1].v / oosStart - 1 : 0,
          fullSharpe: sliceSharpe(run.equity),
          trades: run.trades.length,
        });
      }
    }
    return { p1, p2, v1, v2, rows, splitT };
  }, [token, bars, strategy, params, options]);

  if (sweepable.length < 2) {
    return (
      <div className="empty-state">
        This strategy exposes fewer than two sweepable parameters. Pick a parameterised strategy to run the robustness grid.
      </div>
    );
  }

  const best = result ? result.rows.reduce((m, r) => (r.oosSharpe > m.oosSharpe ? r : m), result.rows[0]) : null;
  const bestIs = result ? result.rows.reduce((m, r) => (r.isSharpe > m.isSharpe ? r : m), result.rows[0]) : null;

  return (
    <div className="sweep">
      <div className="sweep-head">
        <div>
          <h3>Parameter robustness — {strategy.name}</h3>
          <p className="muted">
            Chronological 70/30 split. Most of the sample is used to pick parameters; the holdout is what matters. A large
            in-sample to out-of-sample decay is the signature of a curve-fit.
          </p>
        </div>
        <button className="btn" onClick={() => setToken((t) => t + 1)}>
          {token ? 'Re-run grid' : `Run ${STEPS * STEPS} backtests`}
        </button>
      </div>

      {!result && (
        <div className="empty-state">
          Sweeping <b>{sweepable[0].label}</b> × <b>{sweepable[1].label}</b> produces {STEPS * STEPS} full backtests across
          both halves of the sample.
        </div>
      )}

      {result && (
        <>
          <div className="sweep-grid-wrap">
            <table className="sweep-grid">
              <thead>
                <tr>
                  <th className="corner">
                    {result.p1.label} \ {result.p2.label}
                  </th>
                  {result.v2.map((b) => (
                    <th key={b}>{fmtParam(result.p2, b)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.v1.map((a) => (
                  <tr key={a}>
                    <th>{fmtParam(result.p1, a)}</th>
                    {result.v2.map((b) => {
                      const row = result.rows.find((r) => r.a === a && r.b === b)!;
                      return (
                        <td
                          key={b}
                          style={cellStyle(row.oosSharpe)}
                          title={`IS Sharpe ${fmtNum(row.isSharpe)} · OOS Sharpe ${fmtNum(
                            row.oosSharpe,
                          )} · OOS return ${fmtPct(row.oosRet, 1)} · ${row.trades} trades`}
                        >
                          {row.oosSharpe.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sweep-scale">
              <span>OOS Sharpe</span>
              <span className="scale-bar" />
              <span>-2 → +2</span>
            </div>
          </div>

          <div className="sweep-cards">
            <div className="card">
              <h4>Best holdout</h4>
              <p className="mono">
                {result.p1.label} {fmtParam(result.p1, best!.a)} · {result.p2.label} {fmtParam(result.p2, best!.b)}
              </p>
              <div className="kv">
                <span>OOS Sharpe</span>
                <b>{fmtNum(best!.oosSharpe)}</b>
              </div>
              <div className="kv">
                <span>IS Sharpe</span>
                <b>{fmtNum(best!.isSharpe)}</b>
              </div>
              <div className="kv">
                <span>OOS return</span>
                <b className={best!.oosRet >= 0 ? 'pos' : 'neg'}>{fmtPct(best!.oosRet, 1)}</b>
              </div>
            </div>
            <div className="card">
              <h4>Best in-sample (the trap)</h4>
              <p className="mono">
                {result.p1.label} {fmtParam(result.p1, bestIs!.a)} · {result.p2.label} {fmtParam(result.p2, bestIs!.b)}
              </p>
              <div className="kv">
                <span>IS Sharpe</span>
                <b>{fmtNum(bestIs!.isSharpe)}</b>
              </div>
              <div className="kv">
                <span>Its OOS Sharpe</span>
                <b>{fmtNum(bestIs!.oosSharpe)}</b>
              </div>
              <div className="kv">
                <span>Decay</span>
                <b className="neg">{fmtNum(bestIs!.isSharpe - bestIs!.oosSharpe)}</b>
              </div>
            </div>
            <div className="card">
              <h4>Read on the grid</h4>
              <p className="muted small">
                A wide plateau of positive holdout cells suggests the edge is structural. A single hot cell surrounded by
                red is noise. 25 trials also inflates the best cell — treat it as a hypothesis, not a result.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
