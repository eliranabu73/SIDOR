"use client";

import * as React from "react";
import { DateTime } from "luxon";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Timer,
  Users,
} from "lucide-react";
import { DemoBoundary, useDemoMode } from "@/components/auth/DemoBoundary";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimeEntries, useTimetrackingLive } from "@/lib/queries";
import {
  fetchTimeEntries,
  fetchTimetrackingLive,
  type LiveClockStatus,
  type TimeEntry,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Mock data (shown in demo mode)
// ---------------------------------------------------------------------------

const NOW = DateTime.now();

const MOCK_LIVE: LiveClockStatus[] = [
  {
    employeeId: "e1",
    employeeName: "נועה כהן",
    clockInAt: NOW.minus({ hours: 2, minutes: 15 }).toISO()!,
  },
  {
    employeeId: "e2",
    employeeName: "איתי לוי",
    clockInAt: NOW.minus({ hours: 1, minutes: 45 }).toISO()!,
  },
  {
    employeeId: "e3",
    employeeName: "מיה גולן",
    clockInAt: NOW.minus({ minutes: 45 }).toISO()!,
  },
];

function makeMockEntry(
  id: string,
  name: string,
  inHour: number,
  durationMin: number,
  scheduledMin: number,
): TimeEntry {
  const clockIn = NOW.startOf("day").set({ hour: inHour });
  const clockOut = clockIn.plus({ minutes: durationMin });
  return {
    id,
    employeeId: `e${id}`,
    employeeName: name,
    clockInAt: clockIn.toISO()!,
    clockOutAt: clockOut.toISO()!,
    durationMinutes: durationMin,
    shiftAssignmentId: null,
    scheduledStartAt: clockIn.toISO()!,
    scheduledEndAt: clockIn.plus({ minutes: scheduledMin }).toISO()!,
    scheduledMinutes: scheduledMin,
    note: null,
  };
}

const MOCK_ENTRIES: TimeEntry[] = [
  makeMockEntry("1", "נועה כהן", 8, 495, 480),
  makeMockEntry("2", "איתי לוי", 9, 420, 480),
  makeMockEntry("3", "מיה גולן", 10, 360, 480),
  makeMockEntry("4", "דן ברק", 7, 510, 480),
  makeMockEntry("5", "רוני שמש", 8, 440, 480),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return DateTime.fromISO(iso).toFormat("HH:mm");
}

function fmtHours(minutes: number | null): string {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, "0")}`;
}

function variance(entry: TimeEntry): number | null {
  if (entry.durationMinutes === null || entry.scheduledMinutes === null)
    return null;
  return entry.durationMinutes - entry.scheduledMinutes;
}

function varianceColor(delta: number | null): string {
  if (delta === null) return "text-muted-foreground";
  if (delta >= 0) return "text-emerald-600 dark:text-emerald-400";
  if (delta >= -30) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function varianceIcon(delta: number | null) {
  if (delta === null) return null;
  if (delta >= 0)
    return <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-500" />;
  if (delta >= -30)
    return <AlertTriangle className="inline h-3.5 w-3.5 text-amber-500" />;
  return <AlertTriangle className="inline h-3.5 w-3.5 text-rose-500" />;
}

function elapsedStr(clockInAt: string): string {
  const diffMin = Math.floor(
    DateTime.now().diff(DateTime.fromISO(clockInAt), "minutes").minutes,
  );
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `${h}:${String(m).padStart(2, "0")}h`;
}

function weekRange(): { from: string; to: string; label: string } {
  const start = DateTime.now().startOf("week");
  const end = start.plus({ days: 6 });
  return {
    from: start.toFormat("yyyy-MM-dd"),
    to: end.toFormat("yyyy-MM-dd"),
    label: `${start.toFormat("d.M")} – ${end.toFormat("d.M.yyyy")}`,
  };
}

function exportCsv(entries: TimeEntry[], label: string) {
  const header = "עובד,כניסה,יציאה,שעות בפועל,שעות מתוכננות,הפרש";
  const rows = entries.map((e) => {
    const delta = variance(e);
    return [
      `"${e.employeeName}"`,
      fmtTime(e.clockInAt),
      fmtTime(e.clockOutAt),
      fmtHours(e.durationMinutes),
      fmtHours(e.scheduledMinutes),
      delta !== null ? fmtHours(delta) : "",
    ].join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `timetracking-${label}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export default function TimetrackingPage() {
  return (
    <DemoBoundary>
      <AppShell>
        <TimetrackingContent />
      </AppShell>
    </DemoBoundary>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function TimetrackingContent() {
  const isDemo = useDemoMode();
  const week = weekRange();
  const [from, setFrom] = React.useState(week.from);
  const [to, setTo] = React.useState(week.to);

  const liveQuery = useTimetrackingLive();
  const entriesQuery = useTimeEntries(from, to);

  const liveData: LiveClockStatus[] = isDemo
    ? MOCK_LIVE
    : (liveQuery.data?.employees ?? []);

  const entries: TimeEntry[] = isDemo
    ? MOCK_ENTRIES
    : (entriesQuery.data ?? []);

  const totalScheduled = entries.reduce(
    (s, e) => s + (e.scheduledMinutes ?? 0),
    0,
  );
  const totalActual = entries.reduce(
    (s, e) => s + (e.durationMinutes ?? 0),
    0,
  );
  const totalDelta = totalActual - totalScheduled;

  return (
    <div dir="rtl" className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">נוכחות עובדים</h1>
          <p className="text-sm text-muted-foreground mt-0.5">שעון נוכחות · מנהל</p>
        </div>
        {isDemo && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
            מצב הדגמה — נתונים לדוגמה
          </span>
        )}
      </div>

      {/* Section A: Live status */}
      <LiveSection employees={liveData} loading={liveQuery.isLoading && !isDemo} />

      {/* Section B: Date range + entries table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4 flex-wrap border-b border-border">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Timer className="h-4 w-4 text-indigo-500" />
            רשומות נוכחות
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              מ:
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              עד:
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() =>
                exportCsv(
                  entries,
                  `${from}_${to}`,
                )
              }
              disabled={entries.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              ייצוא CSV
            </Button>
          </div>
        </div>

        {entriesQuery.isLoading && !isDemo ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Clock className="mx-auto mb-2 h-8 w-8 opacity-30" />
            אין רשומות נוכחות לתקופה זו
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-right font-medium">עובד</th>
                  <th className="px-4 py-2.5 text-right font-medium">כניסה</th>
                  <th className="px-4 py-2.5 text-right font-medium">יציאה</th>
                  <th className="px-4 py-2.5 text-right font-medium">סה&quot;כ שעות</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    משמרת מתוכננת
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">הפרש</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => {
                  const delta = variance(entry);
                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        {entry.employeeName}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {fmtTime(entry.clockInAt)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {fmtTime(entry.clockOutAt)}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-semibold">
                        {fmtHours(entry.durationMinutes)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {fmtHours(entry.scheduledMinutes)}
                      </td>
                      <td
                        className={`px-4 py-3 tabular-nums font-semibold ${varianceColor(delta)}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {varianceIcon(delta)}
                          {delta !== null
                            ? `${delta >= 0 ? "+" : ""}${fmtHours(delta)}`
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section C: Variance summary */}
      {entries.length > 0 && (
        <VarianceSummary
          scheduled={totalScheduled}
          actual={totalActual}
          delta={totalDelta}
          label={`${from} – ${to}`}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section A: Live status
// ---------------------------------------------------------------------------

function LiveSection({
  employees,
  loading,
}: {
  employees: LiveClockStatus[];
  loading: boolean;
}) {
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

  // Tick every 30s to update elapsed times
  React.useEffect(() => {
    const id = setInterval(() => forceUpdate(), 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <Skeleton className="h-32 rounded-2xl" />;
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <Users className="h-4 w-4 text-emerald-500" />
        <h2 className="text-base font-semibold">
          {employees.length > 0
            ? `${employees.length} עובד${employees.length > 1 ? "ים" : ""} במשמרת כרגע`
            : "אין עובדים במשמרת כרגע"}
        </h2>
        {employees.length > 0 && (
          <span className="ms-auto flex h-2 w-2 relative">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        )}
      </div>

      {employees.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Clock className="mx-auto mb-2 h-6 w-6 opacity-30" />
          לא נרשמה כניסה לאף עובד כרגע
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {employees.map((emp) => (
            <li
              key={emp.employeeId}
              className="flex items-center gap-4 px-5 py-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {emp.employeeName.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">{emp.employeeName}</div>
                <div className="text-xs text-muted-foreground">
                  כניסה: {fmtTime(emp.clockInAt)}
                </div>
              </div>
              <div className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                ⏱ {elapsedStr(emp.clockInAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section C: Variance summary
// ---------------------------------------------------------------------------

function VarianceSummary({
  scheduled,
  actual,
  delta,
  label,
}: {
  scheduled: number;
  actual: number;
  delta: number;
  label: string;
}) {
  const isShort = delta < -30;

  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
        <CheckCircle2
          className={`h-4 w-4 ${isShort ? "text-rose-500" : "text-emerald-500"}`}
        />
        סיכום שעות · {label}
      </h2>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold tabular-nums text-indigo-500">
            {fmtHours(scheduled)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">שעות מתוכננות</div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {fmtHours(actual)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">שעות בפועל</div>
        </div>
        <div>
          <div
            className={`text-2xl font-bold tabular-nums ${isShort ? "text-rose-500" : "text-emerald-500"}`}
          >
            {delta >= 0 ? "+" : ""}
            {fmtHours(delta)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            הפרש {isShort ? "⚠" : "✓"}
          </div>
        </div>
      </div>
    </Card>
  );
}
