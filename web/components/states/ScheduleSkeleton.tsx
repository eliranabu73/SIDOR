"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const DAYS_HE = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

/**
 * Skeleton of the real schedule board — NOT a spinner.
 *
 * Co-designed with ChatGPT (Q4, 2026-05-21):
 *   - 7 days, 2-4 random skeleton shifts per day.
 *   - shimmer animation (already in globals.css), 1.4s.
 *   - Why: the brain starts parsing the layout before the data arrives.
 *
 * Deterministic per render — uses a stable seed so the skeleton doesn't
 * flicker between server / client during hydration.
 */
export function ScheduleSkeleton({ minWidth = 1100 }: { minWidth?: number }) {
  // Pre-computed per-day shift counts (deterministic: 2, 3, 2, 4, 3, 2, 3)
  const counts = [2, 3, 2, 4, 3, 2, 3] as const;

  return (
    <div
      className="grid grid-cols-7 gap-2"
      style={{ minWidth: `${minWidth}px` }}
      role="status"
      aria-label="טוען סידור עבודה..."
    >
      {Array.from({ length: 7 }, (_, day) => (
        <div key={day} className="flex flex-col gap-2">
          <div className="text-center text-xs font-semibold pb-1 border-b opacity-60">
            <div>{DAYS_HE[day]}</div>
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: counts[day]! }, (_, i) => (
              <SkeletonShift key={i} variant={(day + i) % 3} />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">טוען סידור עבודה...</span>
    </div>
  );
}

/** A single skeleton card. Variant changes height slightly so it doesn't look like a regular grid. */
function SkeletonShift({ variant }: { variant: number }) {
  const heights = ["h-20", "h-24", "h-28"];
  return (
    <div
      className={cn(
        "rounded-lg border p-2 flex flex-col gap-2",
        heights[variant] ?? "h-24",
      )}
      style={{
        backgroundColor: "var(--color-shift-empty-bg)",
        borderColor: "var(--color-shift-empty-border)",
      }}
      aria-hidden
    >
      <div className="skeleton h-3 w-3/4 rounded" />
      <div className="skeleton h-2 w-1/2 rounded" />
      <div className="mt-auto flex gap-1">
        <div className="skeleton h-5 w-12 rounded-full" />
        <div className="skeleton h-5 w-12 rounded-full" />
      </div>
    </div>
  );
}
