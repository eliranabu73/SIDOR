"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, Clock, ShieldAlert, Users, Wallet } from "lucide-react";
import { DateTime } from "luxon";
import { fetchLaborCost, type LaborCostResponse } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  weekStart: DateTime;
  onOpenDetail?: () => void;
};

const COLLAPSE_KEY = "labor-bar-collapsed";

export function LaborCostBar({ weekStart, onOpenDetail }: Props) {
  const wsISO = weekStart.toISO() ?? "";
  const q = useQuery({
    queryKey: ["labor-cost", wsISO],
    queryFn: () => fetchLaborCost(wsISO),
    enabled: !!wsISO,
    staleTime: 30_000,
  });

  const [collapsed, setCollapsed] = React.useState<boolean>(false);
  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(COLLAPSE_KEY);
      if (v === "1") setCollapsed(true);
    } catch {
      // ignore — SSR or storage disabled
    }
  }, []);
  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  if (q.isLoading) {
    return (
      <div className="grid grid-cols-4 gap-3 px-3 pt-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  if (q.isError || !q.data) {
    return null; // fail silently — board is more important than cost bar
  }
  const data = q.data;
  const fmt = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  });

  return (
    <div className="border-b border-border bg-card/50 backdrop-blur">
      <div className="flex items-center justify-between px-3 pt-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          <span className="font-medium">עלות שכר שבועית</span>
          {collapsed ? (
            <span className="tabular-nums">{fmt.format(data.totals.cost)}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "הצג פירוט עלויות" : "הסתר פירוט עלויות"}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>
      </div>
      {!collapsed && (
        <div className="grid grid-cols-2 gap-3 px-3 pb-3 pt-2 md:grid-cols-4">
          <Stat
            icon={Wallet}
            label="עלות שכר השבוע"
            primary={fmt.format(data.totals.cost)}
            secondary={`${data.totals.hours.toFixed(0)} שעות · ${data.totals.shifts} משמרות`}
            tone="brand"
            onClick={onOpenDetail}
          />
          <Stat
            icon={Users}
            label="עובדים בסידור"
            primary={String(data.totals.employees)}
            secondary={
              data.totals.overtimeEmployees > 0
                ? `${data.totals.overtimeEmployees} בדרך לשעות נוספות`
                : "ללא חריגות שעתיות"
            }
            tone={data.totals.overtimeEmployees > 0 ? "warning" : "default"}
          />
          <Stat
            icon={Clock}
            label="שעות לא מכוסות"
            primary={data.totals.uncoveredHours.toFixed(0)}
            secondary={
              data.totals.openShifts > 0
                ? `${data.totals.openShifts} משמרות פתוחות`
                : "השבוע מכוסה במלואו"
            }
            tone={data.totals.uncoveredHours > 0 ? "danger" : "ok"}
          />
          <Stat
            icon={ShieldAlert}
            label="עובדים בלי תעריף"
            primary={String(data.totals.employeesWithoutRate)}
            secondary={
              data.totals.employeesWithoutRate > 0
                ? `מחושב לפי ${data.defaultHourlyRate}₪/ש'`
                : "כל העובדים מתומחרים"
            }
            tone={data.totals.employeesWithoutRate > 0 ? "warning" : "ok"}
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  primary,
  secondary,
  tone,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  primary: string;
  secondary: string;
  tone: "default" | "brand" | "warning" | "danger" | "ok";
  onClick?: () => void;
}) {
  const toneRing: Record<typeof tone, string> = {
    default: "border-border",
    brand: "border-indigo-500/40 bg-gradient-to-br from-indigo-500/10 to-cyan-400/10",
    warning: "border-amber-500/40 bg-amber-500/5",
    danger: "border-red-500/40 bg-red-500/5",
    ok: "border-emerald-500/40 bg-emerald-500/5",
  };
  const iconColor: Record<typeof tone, string> = {
    default: "text-muted-foreground",
    brand: "text-indigo-500",
    warning: "text-amber-500",
    danger: "text-red-500",
    ok: "text-emerald-500",
  };
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-start transition-all ${toneRing[tone]} ${
        onClick ? "hover:-translate-y-0.5 hover:shadow-md cursor-pointer" : ""
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/60">
        <Icon className={`h-4 w-4 ${iconColor[tone]}`} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-lg font-bold tabular-nums">{primary}</span>
        <span className="text-[11px] text-muted-foreground">{secondary}</span>
      </div>
      {tone === "warning" || tone === "danger" ? (
        <AlertTriangle className={`ml-auto h-4 w-4 ${iconColor[tone]}`} />
      ) : null}
    </Wrapper>
  );
}

export type { LaborCostResponse };
