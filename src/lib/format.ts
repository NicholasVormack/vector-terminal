export const fmtPrice = (v: number, digits = 2) =>
  Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

export const fmtMoney = (v: number) =>
  Number.isFinite(v)
    ? (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
    : '—';

export const fmtSignedMoney = (v: number) =>
  Number.isFinite(v) ? (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';

export const fmtPct = (v: number, digits = 2) =>
  Number.isFinite(v) ? (v * 100).toFixed(digits) + '%' : '—';

export const fmtSignedPct = (v: number, digits = 2) =>
  Number.isFinite(v) ? (v >= 0 ? '+' : '') + (v * 100).toFixed(digits) + '%' : '—';

export function fmtCompact(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e12) return sign + (a / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return sign + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return sign + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return sign + (a / 1e3).toFixed(1) + 'K';
  return sign + a.toFixed(0);
}

export const fmtNum = (v: number, digits = 2) =>
  Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getUTCDate().toString().padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtShortDate(t: number): string {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtDay(t: number): string {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const monthLabel = (m: number) => MONTHS[m];

export function signClass(v: number): string {
  if (!Number.isFinite(v) || v === 0) return 'flat';
  return v > 0 ? 'pos' : 'neg';
}
