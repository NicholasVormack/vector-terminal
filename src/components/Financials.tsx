import type { Instrument } from '../types';
import { deriveFinancials, marketCap, qualityBreakdown } from '../data/fundamentals';
import { fmtCompact, fmtMoney, fmtPct, fmtPrice } from '../lib/format';

function Statement({
  title,
  years,
  rows,
}: {
  title: string;
  years: number[];
  rows: { label: string; values: number[]; format: (v: number) => string; strong?: boolean; tone?: boolean }[];
}) {
  return (
    <div className="statement">
      <h4>{title}</h4>
      <table className="data-table fin-table">
        <thead>
          <tr>
            <th>US$B unless noted</th>
            {years.map((y) => (
              <th key={y} className="num">
                FY{y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={r.strong ? 'strong-row' : ''}>
              <td>{r.label}</td>
              {r.values.map((v, i) => {
                const prev = i > 0 ? r.values[i - 1] : null;
                const cls = r.tone ? (v >= 0 ? 'pos' : 'neg') : '';
                return (
                  <td key={i} className={`num mono ${cls}`}>
                    {r.format(v)}
                    {r.tone && prev !== null && (
                      <span className="chg-inline">{v >= prev ? ' ▲' : ' ▼'}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Financials({ inst }: { inst: Instrument }) {
  const f = deriveFinancials(inst);
  const latest = f[f.length - 1];
  const q = qualityBreakdown(inst);
  const years = f.map((y) => y.year);
  const mc = marketCap(inst);

  const maxRev = Math.max(...f.map((y) => y.revenue));

  return (
    <div className="financials">
      <div className="fin-head">
        <div>
          <h3>
            {inst.name} <span className="sym-tag">{inst.symbol}</span>
          </h3>
          <p className="fin-sub">
            {inst.sector} · {inst.industry} · {inst.exchange} · {inst.hq} · {inst.country}
          </p>
          <p className="fin-desc">{inst.description}</p>
        </div>
        <div className="fin-facts">
          <div>
            <span>Market cap</span>
            <b>${fmtCompact(mc)}</b>
          </div>
          <div>
            <span>Last price</span>
            <b>{fmtPrice(inst.price)}</b>
          </div>
          <div>
            <span>Shares out</span>
            <b>{fmtCompact(inst.sharesOut)}</b>
          </div>
          <div>
            <span>Employees</span>
            <b>{inst.employees.toLocaleString('en-US')}</b>
          </div>
          <div>
            <span>CEO</span>
            <b>{inst.ceo}</b>
          </div>
          <div>
            <span>Founded / IPO</span>
            <b>{inst.ipo}</b>
          </div>
          <div>
            <span>Beta</span>
            <b>{inst.beta.toFixed(2)}</b>
          </div>
          <div>
            <span>Dividend yield</span>
            <b>{fmtPct(inst.dividendYield, 2)}</b>
          </div>
        </div>
      </div>

      <div className="fin-grid">
        <div className="card quality-card">
          <div className="quality-head">
            <h4>Quality score</h4>
            <div className="quality-score">{Math.round(q.total)}</div>
          </div>
          <div className="quality-bars">
            {q.parts.map((p) => (
              <div key={p.key} className="qbar">
                <span>{p.key}</span>
                <div className="qbar-track">
                  <div className="qbar-fill" style={{ width: `${Math.max(3, Math.min(100, p.score))}%` }} />
                </div>
                <b>{Math.round(p.score)}</b>
              </div>
            ))}
          </div>
          <p className="footnote">
            Weighted heuristic over margin, ROIC, FCF conversion, leverage and growth. Not investment advice.
          </p>
        </div>

        <div className="card growth-card">
          <h4>Revenue vs net income · US$B</h4>
          <div className="growth-chart">
            {f.map((y) => (
              <div key={y.year} className="growth-col" title={`FY${y.year}: rev ${fmtMoney(y.revenue * 1e9)} · NI ${fmtMoney(y.netIncome * 1e9)}`}>
                <div className="gc-bars">
                  <div className="gc-rev" style={{ height: `${(y.revenue / maxRev) * 100}%` }} />
                  <div
                    className="gc-ni"
                    style={{ height: `${(y.netIncome / maxRev) * 100}%` }}
                  />
                </div>
                <span>{y.year}</span>
              </div>
            ))}
          </div>
          <div className="legend">
            <span><i className="sw rev" /> Revenue</span>
            <span><i className="sw ni" /> Net income</span>
          </div>
        </div>
      </div>

      <div className="fin-statements">
        <Statement
          title="Income statement"
          years={years}
          rows={[
            { label: 'Revenue', values: f.map((y) => y.revenue), format: (v) => fmtMoney(v * 1e9), strong: true },
            { label: 'Gross profit', values: f.map((y) => y.grossProfit), format: (v) => fmtMoney(v * 1e9) },
            { label: 'Operating income', values: f.map((y) => y.operatingIncome), format: (v) => fmtMoney(v * 1e9) },
            { label: 'Net income', values: f.map((y) => y.netIncome), format: (v) => fmtMoney(v * 1e9), strong: true, tone: true },
            { label: 'Diluted EPS', values: f.map((y) => y.eps), format: (v) => '$' + v.toFixed(2) },
            { label: 'Net margin', values: f.map((y) => y.ratios.netMargin), format: (v) => fmtPct(v, 1) },
            { label: 'Revenue growth', values: f.map((y) => y.ratios.revGrowth), format: (v) => fmtPct(v, 1), tone: true },
          ]}
        />

        <Statement
          title="Balance sheet"
          years={years}
          rows={[
            { label: 'Cash & equivalents', values: f.map((y) => y.cash), format: (v) => fmtMoney(v * 1e9) },
            { label: 'Total debt', values: f.map((y) => y.totalDebt), format: (v) => fmtMoney(v * 1e9) },
            { label: 'Total assets', values: f.map((y) => y.totalAssets), format: (v) => fmtMoney(v * 1e9) },
            { label: 'Shareholders equity', values: f.map((y) => y.equity), format: (v) => fmtMoney(v * 1e9), strong: true },
            { label: 'Current assets', values: f.map((y) => y.currentAssets), format: (v) => fmtMoney(v * 1e9) },
            { label: 'Current liabilities', values: f.map((y) => y.currentLiabilities), format: (v) => fmtMoney(v * 1e9) },
            { label: 'Net debt / EBITDA', values: f.map((y) => y.ratios.netDebtEbitda), format: (v) => v.toFixed(2) + 'x' },
          ]}
        />

        <Statement
          title="Cash flow"
          years={years}
          rows={[
            { label: 'Operating cash flow', values: f.map((y) => y.operatingCashFlow), format: (v) => fmtMoney(v * 1e9) },
            { label: 'Capital expenditure', values: f.map((y) => y.capex), format: (v) => fmtMoney(v * 1e9) },
            { label: 'Free cash flow', values: f.map((y) => y.freeCashFlow), format: (v) => fmtMoney(v * 1e9), strong: true, tone: true },
            { label: 'FCF margin', values: f.map((y) => y.ratios.fcfMargin), format: (v) => fmtPct(v, 1) },
            { label: 'FCF / net income', values: f.map((y) => y.freeCashFlow / y.netIncome), format: (v) => v.toFixed(2) + 'x' },
          ]}
        />

        <Statement
          title="Returns & efficiency"
          years={years}
          rows={[
            { label: 'Gross margin', values: f.map((y) => y.ratios.grossMargin), format: (v) => fmtPct(v, 1) },
            { label: 'Operating margin', values: f.map((y) => y.ratios.opMargin), format: (v) => fmtPct(v, 1) },
            { label: 'Return on equity', values: f.map((y) => y.ratios.roe), format: (v) => fmtPct(v, 1) },
            { label: 'Return on assets', values: f.map((y) => y.ratios.roa), format: (v) => fmtPct(v, 1) },
            { label: 'ROIC (NOPAT)', values: f.map((y) => y.ratios.roic), format: (v) => fmtPct(v, 1), strong: true },
            { label: 'Asset turnover', values: f.map((y) => y.ratios.assetTurnover), format: (v) => v.toFixed(2) + 'x' },
            { label: 'Current ratio', values: f.map((y) => y.ratios.currentRatio), format: (v) => v.toFixed(2) + 'x' },
          ]}
        />
      </div>

      <p className="footnote">
        Illustrative reference snapshot bundled with the app for offline research — five fiscal years of statements scaled
        from a single reported anchor. Swap in a filings feed before acting on any number here. Book value per share at
        latest fiscal year-end: {fmtPrice((latest.equity * 1e9) / inst.sharesOut)}.
      </p>
    </div>
  );
}
