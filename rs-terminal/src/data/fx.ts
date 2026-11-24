import { useCallback, useEffect, useState } from 'react';

/**
 * There is no official exchange rate for in-game gold.
 *
 * Two things do exist: the bond, which has a gp price and a real-money price, and
 * private trades, which Jagex's terms prohibit and which this terminal does not
 * touch. So the conversion is an input, not a fact: every USD figure on screen is
 * a multiplication by the number in this panel, and it is labelled as a reference
 * rate wherever it appears.
 *
 * Defaults are a starting point chosen to be edited, not a quote.
 */
export interface FxConfig {
  osrsUsdPerM: number;
  rs3UsdPerM: number;
  bondGp: number;
  bondUsd: number;
}

const KEY = 'gt-fx-v1';

export const DEFAULT_FX: FxConfig = {
  osrsUsdPerM: 0.18,
  rs3UsdPerM: 0.045,
  bondGp: 0,
  bondUsd: 0,
};

export function bondImpliedUsdPerM(bondGp: number, bondUsd: number): number {
  if (!Number.isFinite(bondGp) || !Number.isFinite(bondUsd) || bondGp <= 0 || bondUsd <= 0) return 0;
  return bondUsd / (bondGp / 1e6);
}

export function loadFx(): FxConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_FX;
    const parsed = JSON.parse(raw) as Partial<FxConfig>;
    return { ...DEFAULT_FX, ...parsed };
  } catch {
    return DEFAULT_FX;
  }
}

export function useFx() {
  const [fx, setFx] = useState<FxConfig>(() => loadFx());

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(fx));
    } catch {
      // Private mode or a full quota: the rate just will not survive a reload.
    }
  }, [fx]);

  const patch = useCallback((p: Partial<FxConfig>) => setFx((f) => ({ ...f, ...p })), []);
  const reset = useCallback(() => setFx(DEFAULT_FX), []);

  return { fx, patch, reset };
}

export const gpToUsd = (gp: number, usdPerM: number) =>
  Number.isFinite(gp) && Number.isFinite(usdPerM) ? (gp / 1e6) * usdPerM : NaN;

export const usdToGp = (usd: number, usdPerM: number) =>
  Number.isFinite(usd) && usdPerM > 0 ? (usd / usdPerM) * 1e6 : NaN;

export function fxFor(fx: FxConfig, market: 'osrs' | 'rs3'): number {
  return market === 'rs3' ? fx.rs3UsdPerM : fx.osrsUsdPerM;
}
