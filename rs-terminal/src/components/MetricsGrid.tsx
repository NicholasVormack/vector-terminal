export interface MetricRow {
  label: string;
  value: string;
  note?: string;
  tone?: 'pos' | 'neg' | 'flat';
}

export function MetricsGrid({ rows }: { rows: MetricRow[] }) {
  return (
    <div className="metrics">
      {rows.map((r) => (
        <div className="metric" key={r.label}>
          <span className="metric-label">{r.label}</span>
          <b className={`metric-value ${r.tone ?? ''}`}>{r.value}</b>
          {r.note && <span className="metric-note">{r.note}</span>}
        </div>
      ))}
    </div>
  );
}
