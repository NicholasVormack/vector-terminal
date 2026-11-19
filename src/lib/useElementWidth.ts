import { useEffect, useRef, useState } from 'react';

/**
 * Tracks an element's rendered width. ResizeObserver is the primary source,
 * with a window resize listener as a fallback for environments where
 * observer callbacks are not delivered after a viewport change.
 */
export function useElementWidth<T extends HTMLElement>(fallback = 800) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(w);
    };

    update();
    const raf = requestAnimationFrame(update);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [fallback]);

  return { ref, width };
}
