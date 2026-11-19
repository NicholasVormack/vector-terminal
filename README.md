# VECTOR — Research Terminal

A from-scratch equity research terminal: hand-rendered candlestick charting, an event-driven
backtester with modelled execution costs, performance analytics, and a fundamentals view.

Built with Vite, React and TypeScript. **No charting library, no UI library, no CSS framework** —
the candles, axes, crosshair, heatmap and curves are hand-written SVG.

---

## What it does

| Area | Detail |
| --- | --- |
| **Charting** | OHLC candles + wicks, volume panel, log scale, month grid, crosshair readout, last-price tag, wheel zoom, drag pan, indicator overlays (SMA 20/50/200, Bollinger), trade entry/exit markers |
| **Engine** | Bar-by-bar event loop, next-open fills, fractional sizing, commission + minimum ticket + slippage per fill, stop-loss / take-profit / trailing stops with gap-aware fills, long and short, partial exits, forced liquidation at the end of the sample |
| **Analytics** | CAGR, Sharpe, Sortino, Calmar, max drawdown and underwater duration, volatility, beta/alpha vs buy-and-hold, profit factor, win rate, expectancy, exposure, turnover, historical VaR/CVaR, skew/kurtosis, monthly returns heatmap |
| **Robustness** | Parameter grid scored on an out-of-sample holdout (70/30 chronological split), with in-sample values beside it to expose curve-fitting decay |
| **Fundamentals** | Five fiscal years of income statement, balance sheet, cash flow and returns/efficiency ratios, company details, quality heuristic |
| **Data** | Deterministic offline market simulator (default) or a live Twelve Data feed with a user-supplied key |

## Running locally

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # typecheck + production build to dist/
```

## Deploying to GitHub Pages

The build uses a relative base (`base: './'`), so it works at `https://<user>.github.io/<repo>/`
without editing the repo name anywhere.

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main` or `master`, or run the workflow manually. Both branch names are wired into the
   trigger, so whichever default branch you use will deploy. There is no job-level condition that
   could skip a push.

For a private repository, Pages requires a plan that supports it; a public repo deploys on the free tier.

## Architecture

```
src/
  data/         universe + fundamentals snapshot, deterministic simulator, feed adapter
  engine/       indicators → strategies → execution → metrics
  components/   price chart (SVG), area chart, heatmap, tables, sweep, panels
  lib/          formatting, element measurement
```

The engine is a pure function:
`runBacktest(bars, strategy, params, options) → { equity, trades, metrics }`.
No DOM, no React, no network — which is what lets the robustness sweep run 25 full backtests
synchronously and stay instant.

## Notes on the build

The reasoning, the mistakes and the things this still cannot do live in the app's **Engineering**
tab (`src/components/Engineering.tsx`) and nowhere else, so the two copies cannot drift apart.

## Stack

Vite · React 18 · TypeScript (strict) · zero runtime dependencies beyond React.
