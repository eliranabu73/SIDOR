"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Award,
  Clock,
  Moon,
  Scale,
  Sun,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchFairness,
  type FairnessEmployee,
  type FairnessResponse,
} from "@/lib/api";

const WEEKS_OPTIONS = [2, 4, 8, 13];

export default function FairnessPage() {
  return (
    <AuthGuard>
      <AppShell>
        <FairnessInner />
      </AppShell>
    </AuthGuard>
  );
}

function FairnessInner() {
  const [weeks, setWeeks] = React.useState(4);
  const q = useQuery({
    queryKey: ["fairness", weeks],
    queryFn: () => fetchFairness(weeks),
    staleTime: 60_000,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Scale className="h-6 w-6 text-indigo-500" />
          הוגנות בסידור
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          מי מקבל יותר מדי סופ"שים, לילות וסגירות. השווה מול חציון הצוות.
        </p>
        <div className="mt-3 inline-flex rounded-lg border border-border bg-card p-1">
          {WEEKS_OPTIONS.map((w) => (
            <button
              key={w}
              onClick={() => setWeeks(w)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                weeks === w
                  ? "bg-gradient-to-r from-indigo-500 to-cyan-400 text-white shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {w} שבועות
            </button>
          ))}
        </div>
      </header>

      {q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : q.isError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            שגיאה בטעינת נתוני הוגנות
          </CardContent>
        </Card>
      ) : !q.data ? null : (q.data.employees.length === 0) ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            אין מספיק נתונים בחלון הזמן הזה.
          </CardContent>
        </Card>
      ) : (
        <FairnessView data={q.data} />
      )}
    </div>
  );
}

function FairnessView({ data }: { data: FairnessResponse }) {
  return (
    <div className="space-y-4">
      {/* Team summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <TeamStat icon={Clock} label="חציון שעות" value={data.team.medianHours} />
        <TeamStat icon={Sun} label='חציון סופ"שים' value={data.team.medianWeekend} />
        <TeamStat icon={Moon} label="חציון לילות" value={data.team.medianNight} />
        <TeamStat icon={Award} label="חציון סגירות" value={data.team.medianClosing} />
      </div>

      {/* Employee list */}
      <div className="space-y-3">
        {data.employees.map((e) => (
          <EmployeeRow
            key={e.employeeId}
            employee={e}
            team={data.team}
          />
        ))}
      </div>
    </div>
  );
}

function TeamStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10">
          <Icon className="h-4 w-4 text-indigo-500" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmployeeRow({
  employee,
  team,
}: {
  employee: FairnessEmployee;
  team: FairnessResponse["team"];
}) {
  const flagged = employee.flags.length > 0;
  return (
    <Card
      className={
        flagged
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border"
      }
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              {employee.fullName}
              {flagged ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : null}
            </div>
            {employee.flags.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {employee.flags.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400"
                  >
                    {f}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="text-end">
            <div className="text-3xl font-extrabold tabular-nums">
              <span className={scoreColor(employee.score)}>{employee.score}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              ציון הוגנות
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs">
          <MetricCell
            label="שעות"
            value={employee.hours}
            median={team.medianHours}
          />
          <MetricCell
            label='סופ"שים'
            value={employee.weekendShifts}
            median={team.medianWeekend}
          />
          <MetricCell
            label="לילות"
            value={employee.nightShifts}
            median={team.medianNight}
          />
          <MetricCell
            label="סגירות"
            value={employee.closingShifts}
            median={team.medianClosing}
            extra={
              employee.longestClosingStreak >= 3
                ? `${employee.longestClosingStreak} ברצף`
                : undefined
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCell({
  label,
  value,
  median,
  extra,
}: {
  label: string;
  value: number;
  median: number;
  extra?: string;
}) {
  const diff = median > 0 ? value - median : 0;
  const tone = diff > 0 ? "text-amber-500" : diff < 0 ? "text-sky-500" : "text-emerald-500";
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Award;
  return (
    <div className="rounded-md border border-border bg-card/60 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1">
        <span className="text-base font-bold tabular-nums">{value}</span>
        {diff !== 0 ? (
          <span className={`inline-flex items-center gap-0.5 text-[10px] ${tone}`}>
            <Icon className="h-3 w-3" />
            {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
          </span>
        ) : null}
      </div>
      {extra ? (
        <div className="text-[10px] text-amber-500">{extra}</div>
      ) : null}
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-indigo-500";
  if (score >= 40) return "text-amber-500";
  return "text-red-500";
}
