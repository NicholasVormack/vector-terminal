import type { MonthlyRow } from '../types';
import { monthLabel } from '../lib/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cellClass(v: number | null) {
  if (v === null) return 'hm-empty';
  const a = Math.min(1, Math.abs(v) / 0.08);
  return v >= 0 ? `hm-pos-${Math.min(4, Math.ceil(a * 4))}` : `hm-neg-${Math.min(4, Math.ceil(a * 4))}`;
}

export function MonthlyHeatmap({ rows }: { rows: MonthlyRow[] }) {
  const years = rows.map((r) => {
    const vals = r.months.filter((v): v is number => v !== null);
    return { year: r.year, total: vals.reduce((s, v) => s + v, 0) };
  });

  return (
    <div className="heatmap">
      <table>
        <thead>
          <tr>
            <th />
            {MONTHS.map((m) => (
              <th key={m}>{m}</th>
            ))}
            <th className="hm-year">Year</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.year}>
              <td className="hm-label">{row.year}</td>
              {row.months.map((v, mi) => (
                <td key={mi} className={`hm-cell ${cellClass(v)}`} title={`${monthLabel(mi)} ${row.year}: ${v === null ? 'n/a' : (v * 100).toFixed(2) + '%'}`}>
                  {v === null ? '' : (v * 100).toFixed(1)}
                </td>
              ))}
              <td className={`hm-cell hm-year ${years[ri].total >= 0 ? 'hm-pos-3' : 'hm-neg-3'}`}>
                {(years[ri].total * 100).toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
