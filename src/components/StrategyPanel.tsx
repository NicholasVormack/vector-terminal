import type { BacktestOptions } from '../types';
import type { ParamDef, Strategy } from '../engine/strategies';

interface Props {
  strategies: Strategy[];
  strategy: Strategy;
  onStrategy: (id: string) => void;
  params: Record<string, number>;
  onParam: (key: string, value: number) => void;
  onResetParams: () => void;
  options: BacktestOptions;
  onOptions: (patch: Partial<BacktestOptions>) => void;
}

function ParamRow({ def, value, onChange }: { def: ParamDef; value: number; onChange: (v: number) => void }) {
  const decimals = def.step < 0.1 ? 2 : def.step < 1 ? 2 : 0;
  return (
    <div className="param-row">
      <div className="param-head">
        <label>{def.label}</label>
        <input
          className="param-num"
          type="number"
          value={Number(value.toFixed(decimals))}
          min={def.min}
          max={def.max}
          step={def.step}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(Math.min(def.max, Math.max(def.min, v)));
          }}
        />
      </div>
      <input
        className="slider"
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function StrategyPanel({
  strategies,
  strategy,
  onStrategy,
  params,
  onParam,
  onResetParams,
  options,
  onOptions,
}: Props) {
  return (
    <div className="strategy-panel">
      <div className="panel-block">
        <div className="panel-title">
          <h5>Strategy</h5>
          <span className="tag">{strategy.family}</span>
        </div>
        <select className="select" value={strategy.id} onChange={(e) => onStrategy(e.target.value)}>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="blurb">{strategy.blurb}</p>
      </div>

      <div className="panel-block">
        <div className="panel-title">
          <h5>Parameters</h5>
          {strategy.params.length > 0 && (
            <button className="link-btn" onClick={onResetParams}>
              reset
            </button>
          )}
        </div>
        {strategy.params.length === 0 && <p className="blurb">No parameters — this is a pure benchmark.</p>}
        {strategy.params.map((def) => (
          <ParamRow key={def.key} def={def} value={params[def.key] ?? def.value} onChange={(v) => onParam(def.key, v)} />
        ))}
      </div>

      <div className="panel-block">
        <div className="panel-title">
          <h5>Execution assumptions</h5>
        </div>
        <div className="exec-grid">
          <label>
            Capital
            <input
              type="number"
              value={options.initialCapital}
              min={1000}
              step={1000}
              onChange={(e) => onOptions({ initialCapital: Math.max(1000, Number(e.target.value) || 1000) })}
            />
          </label>
          <label>
            Commission (bps)
            <input
              type="number"
              value={options.commissionBps}
              min={0}
              step={0.5}
              onChange={(e) => onOptions({ commissionBps: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label>
            Slippage (bps)
            <input
              type="number"
              value={options.slippageBps}
              min={0}
              step={0.5}
              onChange={(e) => onOptions({ slippageBps: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label>
            Min commission
            <input
              type="number"
              value={options.minCommission}
              min={0}
              step={0.5}
              onChange={(e) => onOptions({ minCommission: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
        </div>

        <div className="exec-row">
          <span>Signal fill</span>
          <div className="seg">
            <button
              className={options.fill === 'nextOpen' ? 'on' : ''}
              onClick={() => onOptions({ fill: 'nextOpen' })}
              title="No lookahead: signal on close, fill at the next open"
            >
              Next open
            </button>
            <button
              className={options.fill === 'close' ? 'on' : ''}
              onClick={() => onOptions({ fill: 'close' })}
              title="Optimistic: fills at the same close that generated the signal"
            >
              Same close
            </button>
          </div>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={options.allowShort}
            onChange={(e) => onOptions({ allowShort: e.target.checked })}
          />
          Allow short exposure
        </label>

        <div className="exec-grid stops">
          <label>
            Stop loss %
            <input
              type="number"
              value={Math.round(options.stopLossPct * 1000) / 10}
              min={0}
              max={50}
              step={0.5}
              onChange={(e) => onOptions({ stopLossPct: Math.max(0, Number(e.target.value) || 0) / 100 })}
            />
          </label>
          <label>
            Take profit %
            <input
              type="number"
              value={Math.round(options.takeProfitPct * 1000) / 10}
              min={0}
              max={200}
              step={1}
              onChange={(e) => onOptions({ takeProfitPct: Math.max(0, Number(e.target.value) || 0) / 100 })}
            />
          </label>
          <label>
            Trailing stop %
            <input
              type="number"
              value={Math.round(options.trailingStopPct * 1000) / 10}
              min={0}
              max={50}
              step={0.5}
              onChange={(e) => onOptions({ trailingStopPct: Math.max(0, Number(e.target.value) || 0) / 100 })}
            />
          </label>
        </div>
        <p className="footnote">
          0% disables a stop. Fractional shares are used so targets are exact; costs are charged per fill, either side.
        </p>
      </div>

      <div className="panel-block run-note">
        <div className="pulse" />
        <span>Engine re-runs on every change · next-open fills by default</span>
      </div>
    </div>
  );
}
