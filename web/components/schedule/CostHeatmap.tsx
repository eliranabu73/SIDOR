"use client";

import * as React from "react";

/**
 * Cost heatmap helper — returns a `colorClassForShift(shiftId)` Tailwind class
 * that the board can apply to shift cells to expose cost-per-hour as a soft
 * tint. Quantile-based so it stays useful regardless of overall scale.
 *
 * Buckets:
 *   - low quartile  → emerald (cheap)
 *   - mid two       → amber (typical)
 *   - top quartile  → rose  (expensive)
 *   - unknown id    → empty string (no tint)
 */
export type PerShiftCost = { shiftId: string; agorot: number };

export function useCostHeatmap(perShift: PerShiftCost[] | undefined | null) {
  return React.useMemo(() => {
    const map = new Map<string, "low" | "mid" | "high">();
    if (!perShift || perShift.length === 0) {
      return {
        colorClassForShift: (_id: string) => "",
        bucketForShift: (_id: string) => null as "low" | "mid" | "high" | null,
      };
    }
    const sorted = [...perShift].sort((a, b) => a.agorot - b.agorot);
    const q1 = sorted[Math.floor(sorted.length * 0.25)]?.agorot ?? 0;
    const q3 = sorted[Math.floor(sorted.length * 0.75)]?.agorot ?? 0;
    for (const s of sorted) {
      let bucket: "low" | "mid" | "high";
      if (s.agorot <= q1) bucket = "low";
      else if (s.agorot >= q3) bucket = "high";
      else bucket = "mid";
      map.set(s.shiftId, bucket);
    }
    return {
      bucketForShift: (id: string) => map.get(id) ?? null,
      colorClassForShift: (id: string) => {
        const b = map.get(id);
        if (b === "low") return "ring-1 ring-emerald-400/40 bg-emerald-500/5";
        if (b === "high") return "ring-1 ring-rose-400/40 bg-rose-500/5";
        if (b === "mid") return "ring-1 ring-amber-400/40 bg-amber-500/5";
        return "";
      },
    };
  }, [perShift]);
}

/** Standalone helper for non-hook callers (e.g., server components). */
export function buildCostColorMap(perShift: PerShiftCost[]): Map<string, string> {
  if (perShift.length === 0) return new Map();
  const sorted = [...perShift].sort((a, b) => a.agorot - b.agorot);
  const q1 = sorted[Math.floor(sorted.length * 0.25)]?.agorot ?? 0;
  const q3 = sorted[Math.floor(sorted.length * 0.75)]?.agorot ?? 0;
  const out = new Map<string, string>();
  for (const s of sorted) {
    if (s.agorot <= q1)
      out.set(s.shiftId, "ring-1 ring-emerald-400/40 bg-emerald-500/5");
    else if (s.agorot >= q3)
      out.set(s.shiftId, "ring-1 ring-rose-400/40 bg-rose-500/5");
    else out.set(s.shiftId, "ring-1 ring-amber-400/40 bg-amber-500/5");
  }
  return out;
}
