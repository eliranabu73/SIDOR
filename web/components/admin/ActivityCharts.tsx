"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/api";
import { MiniLineChart } from "./MiniLineChart";

export function ActivityCharts() {
  const signups = useQuery({
    queryKey: ["admin", "chart", "signups", 30],
    queryFn: () => adminApi.signupsChart(30),
    staleTime: 60_000,
  });
  const shifts = useQuery({
    queryKey: ["admin", "chart", "shifts", 30],
    queryFn: () => adminApi.shiftsChart(30),
    staleTime: 60_000,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            הצטרפויות יומיות (30 ימים)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {signups.isLoading ? (
            <Skeleton className="h-[140px] w-full" />
          ) : signups.isError ? (
            <div className="text-xs text-rose-600 dark:text-rose-400">
              שגיאה בטעינה
            </div>
          ) : (
            <MiniLineChart
              data={signups.data?.points ?? []}
              ariaLabel="הצטרפויות יומיות"
              stroke="#6366f1"
              fill="#6366f1"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            משמרות יומיות (30 ימים)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shifts.isLoading ? (
            <Skeleton className="h-[140px] w-full" />
          ) : shifts.isError ? (
            <div className="text-xs text-rose-600 dark:text-rose-400">
              שגיאה בטעינה
            </div>
          ) : (
            <MiniLineChart
              data={shifts.data?.points ?? []}
              ariaLabel="משמרות יומיות"
              stroke="#10b981"
              fill="#10b981"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
