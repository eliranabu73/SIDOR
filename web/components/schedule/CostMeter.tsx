"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Wallet } from "lucide-react";
import { getLaborCost, type ScheduleLaborCostReport } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Floating sticky cost meter for /schedule. Top-right on LTR, top-left on RTL.
 * Hidden entirely when the API returns null (no hourly rates configured).
 *
 * Money is rendered from agorot (integer) so we never compound float rounding
 * across the wire.
 */
type Props = {
  scheduleId: string | null | undefined;
};

const ILS = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fromAgorot(agorot: number): number {
  return agorot / 100;
}

export function CostMeter({ scheduleId }: Props) {
  const q = useQuery<ScheduleLaborCostReport | null>({
    queryKey: ["schedule-labor-cost", scheduleId ?? null],
    queryFn: () => getLaborCost(scheduleId as string),
    enabled: !!scheduleId,
    staleTime: 30_000,
  });

  if (!scheduleId) return null;

  if (q.isLoading) {
    return (
      <div className="pointer-events-none absolute top-3 start-3 z-20 hidden sm:block">
        <Skeleton className="h-24 w-56 rounded-xl" />
      </div>
    );
  }

  // Hidden when org has no rates set OR on error (cost is non-critical).
  if (q.isError || !q.data) return null;

  const data = q.data;
  const total = fromAgorot(data.totalAgorot);
  const avg = fromAgorot(data.avgPerShiftAgorot);
  const delta = fromAgorot(data.deltaAgorot);
  const hasPrev = data.previousTotalAgorot != null;
  const isSaving = delta < 0;
  const isFlat = Math.abs(delta) < 0.01;

  return (
    <div
      role="region"
      aria-label="עלות שכר שבועית"
      className="absolute top-3 start-3 z-20 max-w-[16rem] rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Wallet className="h-3.5 w-3.5" />
        <span className="font-medium">עלות שבועית</span>
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums leading-tight">
        {ILS.format(total)}
      </div>
      <div className="text-[11px] text-muted-foreground tabular-nums">
        {ILS.format(avg)} / משמרת בממוצע
      </div>
      {hasPrev ? (
        <div
          className={`mt-2 flex items-center gap-1 text-xs tabular-nums ${
            isFlat
              ? "text-muted-foreground"
              : isSaving
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {isFlat ? null : isSaving ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )}
          <span>
            {isFlat ? "ללא שינוי" : `${isSaving ? "-" : "+"}${ILS.format(Math.abs(delta))}`}
            <span className="text-muted-foreground"> לעומת שבוע קודם</span>
          </span>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-muted-foreground">
          אין נתוני שבוע קודם
        </div>
      )}
    </div>
  );
}

export default CostMeter;
