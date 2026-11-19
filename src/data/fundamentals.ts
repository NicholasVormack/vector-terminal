import type { FiscalYear, Instrument } from '../types';

/**
 * Builds a five-year statement history from the reference snapshot.
 * Balance-sheet lines are scaled with revenue and given slight year-to-year
 * variation so the statements stay internally consistent and ratios move
 * the way an analyst would expect.
 */
export function deriveFinancials(inst: Instrument): FiscalYear[] {
  const n = inst.years.length;
  const lastRev = inst.revenue[n - 1];
  const shares = inst.sharesOut / 1e9; // billions, so $B / B shares = $ per share
  const TAX = 0.21;

  return inst.years.map((year, k) => {
    const revenue = inst.revenue[k];
    const netIncome = inst.netIncome[k];
    const scale = revenue / lastRev;
    const wobble = 1 + 0.04 * Math.sin(k * 1.7 + inst.symbol.length);

    const grossProfit = revenue * inst.grossMargin * (1 + 0.01 * Math.cos(k * 2.1));
    const operatingIncome = revenue * inst.opMargin * wobble;
    const eps = netIncome / shares;

    const cash = inst.cash * (0.82 + 0.18 * scale);
    const totalDebt = inst.totalDebt * (0.9 + 0.1 * scale);
    const totalAssets = inst.totalAssets * (0.86 + 0.14 * scale);
    const equity = inst.equity * (0.84 + 0.16 * scale);
    const currentAssets = inst.currentAssets * (0.88 + 0.12 * scale);
    const currentLiabilities = inst.currentLiabilities * (0.9 + 0.1 * scale);

    const capex = revenue * inst.capexPct;
    const freeCashFlow = revenue * inst.fcfMargin * (1 + 0.03 * Math.sin(k * 0.9));
    const operatingCashFlow = freeCashFlow + capex;

    const prevRev = k > 0 ? inst.revenue[k - 1] : revenue;
    const prevNi = k > 0 ? inst.netIncome[k - 1] : netIncome;
    const revGrowth = k > 0 ? revenue / prevRev - 1 : 0;
    const epsGrowth = k > 0 ? netIncome / prevNi - 1 : 0;

    const nopat = operatingIncome * (1 - TAX);
    const invested = equity + totalDebt - cash;
    const ebitda = operatingIncome + revenue * 0.05;

    return {
      year,
      revenue,
      grossProfit,
      operatingIncome,
      netIncome,
      eps,
      shares,
      cash,
      totalDebt,
      totalAssets,
      equity,
      currentAssets,
      currentLiabilities,
      operatingCashFlow,
      capex,
      freeCashFlow,
      ratios: {
        grossMargin: grossProfit / revenue,
        opMargin: operatingIncome / revenue,
        netMargin: netIncome / revenue,
        fcfMargin: freeCashFlow / revenue,
        roe: netIncome / equity,
        roa: netIncome / totalAssets,
        roic: invested > 0 ? nopat / invested : 0,
        netDebtEbitda: ebitda > 0 ? (totalDebt - cash) / ebitda : 0,
        currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : 0,
        assetTurnover: revenue / totalAssets,
        revGrowth,
        epsGrowth,
      },
    };
  });
}

export const latest = (years: FiscalYear[]) => years[years.length - 1];

export function marketCap(inst: Instrument) {
  return inst.price * inst.sharesOut;
}

/** Transparent 0-100 heuristic over the five year history. */
export function qualityBreakdown(inst: Instrument) {
  const f = deriveFinancials(inst);
  const l = latest(f);
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const parts = [
    { key: 'Profitability', score: clamp(l.ratios.netMargin * 380), weight: 0.25 },
    { key: 'Capital returns', score: clamp(l.ratios.roic * 320), weight: 0.3 },
    { key: 'Cash conversion', score: clamp(l.ratios.fcfMargin * 340), weight: 0.2 },
    { key: 'Balance sheet', score: clamp(100 - Math.max(0, l.ratios.netDebtEbitda) * 11), weight: 0.15 },
    { key: 'Growth', score: clamp(35 + l.ratios.revGrowth * 260), weight: 0.1 },
  ];
  const total = parts.reduce((s, p) => s + p.score * p.weight, 0);
  return { parts, total };
}
