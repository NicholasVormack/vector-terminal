export const fmtGp = (v: number, digits = 0) =>
  Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

export function fmtGpShort(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'K';
  return s + a.toFixed(0);
}

export const fmtPct = (v: number, digits = 2) =>
  Number.isFinite(v) ? (v * 100).toFixed(digits) + '%' : '—';

export const fmtSignedPct = (v: number, digits = 2) =>
  Number.isFinite(v) ? (v >= 0 ? '+' : '') + (v * 100).toFixed(digits) + '%' : '—';

export const fmtSignedGp = (v: number) =>
  Number.isFinite(v) ? (v >= 0 ? '+' : '-') + fmtGp(Math.abs(v)) : '—';

export const fmtNum = (v: number, digits = 2) =>
  Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(t: number): string {
  const d = new Date(t);
  return `${d.getUTCDate().toString().padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const monthLabel = (m: number) => MONTHS[m];

export function signClass(v: number): string {
  if (!Number.isFinite(v) || v === 0) return 'flat';
  return v > 0 ? 'pos' : 'neg';
}
