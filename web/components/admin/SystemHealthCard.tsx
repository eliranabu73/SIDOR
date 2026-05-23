"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}י׳ ${h}ש׳`;
  if (h > 0) return `${h}ש׳ ${m}ד׳`;
  return `${m}ד׳`;
}

function Row({
  label,
  ok,
  hint,
}: {
  label: string;
  ok: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/50 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-500" />
        )}
        <span className="font-medium">{label}</span>
      </div>
      <span
        className={cn(
          "text-xs",
          ok ? "text-muted-foreground" : "text-rose-600 dark:text-rose-400",
        )}
      >
        {hint ?? (ok ? "תקין" : "כשל")}
      </span>
    </div>
  );
}

export function SystemHealthCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "system-health"],
    queryFn: () => adminApi.systemHealth(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const allOk = !!data?.ok;

  return (
    <Card className="relative overflow-hidden">
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-0.5",
          allOk ? "bg-emerald-500/70" : "bg-rose-500/70",
        )}
      />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4" />
          תקינות מערכת
        </CardTitle>
        {data && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
              allOk
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
            )}
          >
            {allOk ? "הכל תקין" : "תקלה"}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </>
        ) : isError || !data ? (
          <div className="text-xs text-rose-600 dark:text-rose-400">
            לא ניתן לטעון את סטטוס המערכת
          </div>
        ) : (
          <>
            <Row
              label="DB"
              ok={data.checks.db.ok}
              hint={
                data.checks.db.ok
                  ? data.checks.db.latencyMs != null
                    ? `${data.checks.db.latencyMs}ms`
                    : "תקין"
                  : data.checks.db.error
              }
            />
            <Row
              label="Redis"
              ok={data.checks.redis.ok}
              hint={
                data.checks.redis.ok
                  ? data.checks.redis.latencyMs != null
                    ? `${data.checks.redis.latencyMs}ms`
                    : "תקין"
                  : data.checks.redis.error
              }
            />
            <Row
              label="Env"
              ok={data.checks.env.ok}
              hint={
                data.checks.env.ok
                  ? "תקין"
                  : `חסר: ${(data.checks.env.missing ?? []).join(", ")}`
              }
            />
            <div className="flex items-center justify-between px-1 pt-1 text-[11px] text-muted-foreground">
              <span>Uptime: {formatUptime(data.uptimeSec)}</span>
              <span>{data.env ?? ""}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
