import type { ParamDef, Strategy } from '../engine/strategies';
import { STRATEGIES } from '../engine/strategies';
import { fmtGp, fmtPct } from '../lib/format';

interface Props {
  strategy: Strategy;
  params: Record<string, number>;
  onStrategy: (id: string) => void;
  onParam: (key: string, value: number) => void;
  capital: number;
  onCapital: (v: number) => void;
  sizePct: number;
  onSizePct: (v: number) => void;
  patient: boolean;
  onPatient: (v: boolean) => void;
}

function Param({ def, value, onChange }: { def: ParamDef; value: number; onChange: (v: number) => void }) {
  return (
    <div className="param">
      <div className="param-head">
        <label htmlFor={def.key}>{def.label}</label>
        <input
          id={def.key}
          className="param-num mono"
          type="number"
          min={def.min}
          max={def.max}
          step={def.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <input
        className="slider"
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        aria-label={def.label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function StrategyPanel({
  strategy,
  params,
  onStrategy,
  onParam,
  capital,
  onCapital,
  sizePct,
  onSizePct,
  patient,
  onPatient,
}: Props) {
  return (
    <>
      <section className="panel-block">
        <h4>Strategy</h4>
        <select className="select" value={strategy.id} onChange={(e) => onStrategy(e.target.value)}>
          {STRATEGIES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="blurb">{strategy.blurb}</p>
        {strategy.params.map((d) => (
          <Param key={d.key} def={d} value={params[d.key] ?? d.def} onChange={(v) => onParam(d.key, v)} />
        ))}
      </section>

      <section className="panel-block">
        <h4>Capital</h4>
        <div className="param-head">
          <label htmlFor="capital">Stack, gp</label>
          <input
            id="capital"
            className="param-num mono wide"
            type="number"
            step={1_000_000}
            min={100_000}
            value={capital}
            onChange={(e) => onCapital(Number(e.target.value))}
          />
        </div>
        <div className="param">
          <div className="param-head">
            <label htmlFor="size">Deployed per entry</label>
            <span className="mono dim">{fmtPct(sizePct, 0)}</span>
          </div>
          <input
            id="size"
            className="slider"
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={sizePct}
            onChange={(e) => onSizePct(Number(e.target.value))}
          />
        </div>
        <p className="blurb">
          {fmtGp(capital)} gp is the most one position can use here. The buy limit caps it further: six 4-hour
          windows per day, so the quantity is also limited to the item&rsquo;s 4-hour limit times six.
        </p>
      </section>

      <section className="panel-block">
        <h4>Fills</h4>
        <div className="seg">
          <button className={patient ? '' : 'on'} onClick={() => onPatient(false)}>
            Cross the spread
          </button>
          <button className={patient ? 'on' : ''} onClick={() => onPatient(true)}>
            Patient offers
          </button>
        </div>
        <p className="blurb">
          {patient
            ? 'Optimistic: assumes your resting offer fills at the day’s average bid and your sell fills at its average ask. No queue, no partial fills.'
            : 'Honest default: every entry pays the ask and every exit receives the bid, so each round trip starts down the spread.'}
        </p>
      </section>
    </>
  );
}
