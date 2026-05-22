"use client";

import * as React from "react";

/**
 * Tiny requestAnimationFrame-based counter.
 * Returns the current numeric value, easing toward `to` over `durationMs`.
 * Respects prefers-reduced-motion (snaps to `to` immediately).
 */
export function useCountUp(to: number, durationMs = 1400, startOnView = true) {
  const [value, setValue] = React.useState(0);
  const ref = React.useRef<HTMLElement | null>(null);
  const startedRef = React.useRef(false);

  const start = React.useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(to);
      return;
    }

    const startTs = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(to * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [to, durationMs]);

  React.useEffect(() => {
    if (!startOnView) {
      start();
      return;
    }
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      start();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            start();
            io.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [start, startOnView]);

  return { value, ref };
}
