import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bar, Trade } from '../types';
import type { Series } from '../engine/indicators';
import { fmtDate, fmtGp, fmtGpShort, fmtPct, monthLabel } from '../lib/format';
import { useElementWidth } from '../lib/useElementWidth';

export interface Overlay {
  key: string;
  label: string;
  color: string;
  data: Series;
}

interface Props {
  bars: Bar[];
  overlays: Overlay[];
  trades: Trade[];
  logScale: boolean;
  height?: number;
}

const PAD = { l: 10, r: 82, t: 12, b: 22 };
const GAP = 12;
const PRICE_FRAC = 0.76;

export function PriceChart({ bars, overlays, trades, logScale, height = 420 }: Props) {
  const { ref: hostRef, width } = useElementWidth<HTMLDivElement>(900);
  const [rawWin, setWin] = useState({ s: 0, e: 0 });
  /**
   * The zoom window is state, and state outlives a symbol change: switching from a
   * 365-day series to RS3's 180-day one used to hand the renderer a window past the
   * end of the data. Clamping here means every consumer sees indices that exist,
   * on the first render, rather than waiting for the reset effect to catch up.
   */
  const win = useMemo(() => {
    if (!bars.length) return { s: 0, e: 0 };
    const e = Math.min(rawWin.e || bars.length, bars.length);
    const s = Math.max(0, Math.min(rawWin.s, Math.max(0, e - 1)));
    return { s, e };
  }, [rawWin.s, rawWin.e, bars.length]);
  const [hover, setHover] = useState<{ x: number; y: number; i: number } | null>(null);
  const drag = useRef<{ x: number; s: number; e: number } | null>(null);

  useEffect(() => {
    const count = Math.min(bars.length, 240);
    setWin({ s: Math.max(0, bars.length - count), e: bars.length });
  }, [bars]);

  const innerW = Math.max(20, width - PAD.l - PAD.r);
  const innerH = Math.max(20, height - PAD.t - PAD.b);
  const priceH = innerH * PRICE_FRAC;
  const volH = innerH - priceH - GAP;
  const volTop = PAD.t + priceH + GAP;

  const count = Math.max(1, win.e - win.s);
  const step = innerW / count;
  const visible = bars.slice(win.s, win.e);

  const domain = useMemo(() => {
    if (!visible.length) return { lo: 1, hi: 2 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of visible) {
      if (b.l < lo) lo = b.l;
      if (b.h > hi) hi = b.h;
    }
    const pad = (hi - lo) * 0.06 || hi * 0.02;
    return { lo: Math.max(1, lo - pad), hi: hi + pad };
  }, [visible]);

  const maxVol = useMemo(() => visible.reduce((m, b) => Math.max(m, b.v), 1), [visible]);

  const lg = Math.log;
  const loL = lg(Math.max(1, domain.lo));
  const hiL = lg(Math.max(1, domain.hi));
  const yOf = (p: number) => {
    const v = Math.max(1, p);
    const f = logScale ? (lg(v) - loL) / Math.max(1e-9, hiL - loL) : (v - domain.lo) / Math.max(1e-9, domain.hi - domain.lo);
    return PAD.t + priceH * (1 - Math.min(1.02, Math.max(-0.02, f)));
  };
  const priceAtY = (y: number) => {
    const f = 1 - (y - PAD.t) / priceH;
    return logScale ? Math.exp(loL + f * (hiL - loL)) : domain.lo + f * (domain.hi - domain.lo);
  };
  const xOf = (k: number) => PAD.l + (k + 0.5) * step;

  const priceTicks = useMemo(() => {
    const out: number[] = [];
    for (let k = 0; k <= 4; k++) {
      const f = k / 4;
      out.push(logScale ? Math.exp(loL + f * (hiL - loL)) : domain.lo + f * (domain.hi - domain.lo));
    }
    return out;
  }, [domain.lo, domain.hi, logScale]);

  const monthTicks = useMemo(() => {
    const out: { k: number; label: string }[] = [];
    for (let i = win.s; i < win.e; i++) {
      const d = new Date(bars[i].t);
      const prev = i > 0 ? new Date(bars[i - 1].t) : null;
      if (!prev || prev.getUTCMonth() !== d.getUTCMonth() || prev.getUTCFullYear() !== d.getUTCFullYear()) {
        out.push({ k: i - win.s, label: `${monthLabel(d.getUTCMonth())} ${String(d.getUTCFullYear()).slice(2)}` });
      }
    }
    const maxLabels = Math.max(2, Math.floor(innerW / 92));
    const every = Math.max(1, Math.ceil(out.length / maxLabels));
    return out.filter((_, idx) => idx % every === 0);
  }, [win.s, win.e, bars, innerW]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!bars.length) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left - PAD.l) / Math.max(1, innerW)));
      setWin((w) => {
        const span = w.e - w.s;
        const next = Math.round(Math.min(bars.length, Math.max(30, span * (e.deltaY > 0 ? 1.16 : 0.86))));
        const anchor = w.s + frac * span;
        const s = Math.max(0, Math.min(Math.max(0, bars.length - next), Math.round(anchor - frac * next)));
        return { s, e: s + next };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [bars.length, innerW, hostRef]);

  const overlayPaths = useMemo(
    () =>
      overlays.map((ov) => {
        let d = '';
        let pen = false;
        for (let k = 0; k < count; k++) {
          const v = ov.data[win.s + k];
          if (v === null || v === undefined || !Number.isFinite(v)) {
            pen = false;
            continue;
          }
          d += `${pen ? 'L' : 'M'}${xOf(k).toFixed(2)},${yOf(v).toFixed(2)}`;
          pen = true;
        }
        return { ...ov, d };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overlays, win.s, count, step, domain.lo, domain.hi, logScale, priceH],
  );

  const lastBar = visible[visible.length - 1];
  const prevClose = bars[Math.max(0, win.e - 2)]?.c ?? lastBar?.c ?? 0;
  const lastUp = lastBar ? lastBar.c >= prevClose : true;
  const hoverBar = hover ? bars[hover.i] : null;

  if (!bars.length) return <div className="chart-empty">No price history loaded</div>;

  const bodyW = Math.max(1, Math.min(step * 0.68, 14));
  const showBodies = step > 2.2;

  return (
    <div className="price-chart" ref={hostRef} style={{ height }}>
      <svg
        width={width}
        height={height}
        onMouseLeave={() => {
          setHover(null);
          drag.current = null;
        }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, s: win.s, e: win.e };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          if (drag.current) {
            const moved = Math.round((drag.current.x - e.clientX) / Math.max(1, step));
            const span = drag.current.e - drag.current.s;
            const s = Math.max(0, Math.min(bars.length - span, drag.current.s + moved));
            setWin({ s, e: s + span });
            return;
          }
          const k = Math.floor((x - PAD.l) / step);
          if (k >= 0 && k < count) setHover({ x, y, i: win.s + k });
          else setHover(null);
        }}
        onDoubleClick={() => {
          const n = Math.min(bars.length, 240);
          setWin({ s: Math.max(0, bars.length - n), e: bars.length });
        }}
        style={{ cursor: drag.current ? 'grabbing' : 'crosshair' }}
      >
        <defs>
          <clipPath id="priceClip">
            <rect x={PAD.l} y={PAD.t - 2} width={innerW} height={priceH + 4} />
          </clipPath>
          <clipPath id="volClip">
            <rect x={PAD.l} y={volTop} width={innerW} height={volH} />
          </clipPath>
        </defs>

        {priceTicks.map((p, k) => {
          const y = yOf(p);
          return (
            <g key={`pt${k}`}>
              <line x1={PAD.l} x2={PAD.l + innerW} y1={y} y2={y} className="grid" />
              <text x={PAD.l + innerW + 8} y={y + 3.5} className="axis-label">
                {fmtGp(p)}
              </text>
            </g>
          );
        })}

        {monthTicks.map((m, k) => {
          const x = xOf(m.k);
          return (
            <g key={`xt${k}`}>
              <line x1={x} x2={x} y1={PAD.t} y2={volTop + volH} className="grid vert" />
              <text x={x} y={height - 6} className="axis-label" textAnchor="middle">
                {m.label}
              </text>
            </g>
          );
        })}

        <g clipPath="url(#priceClip)">
          {visible.map((b, k) => {
            const up = b.c >= b.o;
            const yO = yOf(b.o);
            const yC = yOf(b.c);
            const top = Math.min(yO, yC);
            const h = Math.max(1, Math.abs(yC - yO));
            const x = xOf(k);
            return (
              <g key={b.t} className={up ? 'candle-up' : 'candle-down'}>
                <line x1={x} x2={x} y1={yOf(b.h)} y2={yOf(b.l)} strokeWidth={1} />
                {showBodies && <rect x={x - bodyW / 2} y={top} width={bodyW} height={h} />}
                {!showBodies && <line x1={x} x2={x} y1={yOf(b.h)} y2={yOf(b.l)} strokeWidth={1.6} />}
              </g>
            );
          })}

          {overlayPaths.map((ov) => (
            <path key={ov.key} d={ov.d} fill="none" stroke={ov.color} strokeWidth={1.3} strokeLinejoin="round" opacity={0.9} />
          ))}

          {trades.map((tr, idx) => {
            const entryK = tr.entryI - win.s;
            const exitK = tr.exitI - win.s;
            const nodes: JSX.Element[] = [];
            if (entryK >= 0 && entryK < count) {
              const y = yOf(bars[tr.entryI].l) + 9;
              nodes.push(
                <polygon
                  key={`e${idx}`}
                  points={`${xOf(entryK)},${y - 5} ${xOf(entryK) + 4},${y} ${xOf(entryK) - 4},${y}`}
                  fill="var(--up)"
                  opacity={0.95}
                >
                  <title>{`Buy ${fmtDate(tr.entryT)} @ ${fmtGp(tr.entryPx)} gp x${tr.qty}`}</title>
                </polygon>,
              );
            }
            if (exitK >= 0 && exitK < count) {
              const y = tr.pnl >= 0 ? yOf(bars[tr.exitI].l) + 16 : yOf(bars[tr.exitI].h) - 16;
              nodes.push(
                <circle key={`x${idx}`} cx={xOf(exitK)} cy={y} r={3} fill={tr.pnl >= 0 ? 'var(--up)' : 'var(--down)'} opacity={0.75}>
                  <title>{`Sell ${fmtDate(tr.exitT)} @ ${fmtGp(tr.exitPx)} gp · ${fmtPct(tr.ret)}`}</title>
                </circle>,
              );
            }
            return nodes;
          })}
        </g>

        <g clipPath="url(#volClip)">
          {visible.map((b, k) => {
            const h = Math.max(1, (b.v / maxVol) * volH);
            return (
              <rect
                key={`v${b.t}`}
                x={xOf(k) - bodyW / 2}
                y={volTop + volH - h}
                width={Math.max(1, bodyW)}
                height={h}
                className={b.c >= b.o ? 'vol-up' : 'vol-down'}
              />
            );
          })}
        </g>
        <line x1={PAD.l} x2={PAD.l + innerW} y1={volTop + volH} y2={volTop + volH} className="grid" />
        <text x={PAD.l + innerW + 8} y={volTop + 10} className="axis-label">
          {fmtGpShort(maxVol)}
        </text>

        {lastBar && (
          <g>
            <line
              x1={PAD.l}
              x2={PAD.l + innerW}
              y1={yOf(lastBar.c)}
              y2={yOf(lastBar.c)}
              className={lastUp ? 'last-line up' : 'last-line down'}
            />
            <rect
              x={PAD.l + innerW + 2}
              y={yOf(lastBar.c) - 8}
              width={70}
              height={16}
              rx={2}
              className={lastUp ? 'last-tag up' : 'last-tag down'}
            />
            <text x={PAD.l + innerW + 37} y={yOf(lastBar.c) + 4} className="last-tag-text" textAnchor="middle">
              {fmtGp(lastBar.c)}
            </text>
          </g>
        )}

        {hover && (
          <g pointerEvents="none">
            <line x1={xOf(hover.i - win.s)} x2={xOf(hover.i - win.s)} y1={PAD.t} y2={volTop + volH} className="crosshair" />
            <line x1={PAD.l} x2={PAD.l + innerW} y1={hover.y} y2={hover.y} className="crosshair" />
            {hover.y < PAD.t + priceH && (
              <>
                <rect x={PAD.l + innerW + 2} y={hover.y - 8} width={70} height={16} rx={2} className="xhair-tag" />
                <text x={PAD.l + innerW + 37} y={hover.y + 4} className="last-tag-text" textAnchor="middle">
                  {fmtGp(priceAtY(hover.y))}
                </text>
              </>
            )}
          </g>
        )}
      </svg>

      {hoverBar && (
        <div
          className="chart-tip"
          style={{
            left: Math.min(width - 210, Math.max(8, (hover?.x ?? 0) + 16)),
            top: Math.min(height - 150, Math.max(8, (hover?.y ?? 0) + 14)),
          }}
        >
          <div className="tip-date">{fmtDate(hoverBar.t)}</div>
          <div className="tip-grid">
            <span>Ask</span>
            <b>{fmtGp(hoverBar.h)}</b>
            <span>Bid</span>
            <b>{fmtGp(hoverBar.l)}</b>
            <span>Mid</span>
            <b>{fmtGp(hoverBar.c)}</b>
            <span>Chg</span>
            <b className={hoverBar.c >= hoverBar.o ? 'pos' : 'neg'}>{fmtPct(hoverBar.c / hoverBar.o - 1)}</b>
            <span>Vol</span>
            <b>{fmtGpShort(hoverBar.v)}</b>
            {overlays.map((ov) => {
              const v = ov.data[hover!.i];
              if (v === null || v === undefined) return null;
              return (
                <span key={ov.key} className="tip-ov">
                  <i style={{ background: ov.color }} />
                  {ov.label}
                  <b>{fmtGp(v)}</b>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
