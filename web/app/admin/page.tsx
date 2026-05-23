"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  CalendarClock,
  TrendingUp,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/api";
import { SystemHealthCard } from "@/components/admin/SystemHealthCard";
import { ActivityCharts } from "@/components/admin/ActivityCharts";

interface MetricCardProps {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ReactNode;
  accent?: string;
}

function MetricCard({ label, value, hint, icon, accent }: MetricCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className={`absolute inset-x-0 top-0 h-0.5 ${accent ?? "bg-primary/60"}`}
      />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminApi.stats(),
    staleTime: 30_000,
  });

  return (
    <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">סקירת מערכת</h1>
        <p className="text-sm text-muted-foreground">
          מבט-על על כל הארגונים, המשתמשים והפעילות במערכת.
        </p>
      </header>

      {isError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            שגיאה בטעינת הנתונים: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : data ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="ארגונים"
            value={data.totalOrgs.toLocaleString("he-IL")}
            hint={`+${data.signupsLast7d} ב-7 הימים האחרונים`}
            icon={<Building2 className="h-4 w-4" />}
            accent="bg-indigo-500/70"
          />
          <MetricCard
            label="משתמשים פעילים"
            value={data.totalUsers.toLocaleString("he-IL")}
            hint="משתמשים עם חברות ב-≥1 ארגון"
            icon={<UsersRound className="h-4 w-4" />}
            accent="bg-emerald-500/70"
          />
          <MetricCard
            label="עובדים"
            value={data.totalEmployees.toLocaleString("he-IL")}
            hint="סך כל העובדים בכל הארגונים"
            icon={<Users className="h-4 w-4" />}
            accent="bg-sky-500/70"
          />
          <MetricCard
            label="משמרות"
            value={data.totalShifts.toLocaleString("he-IL")}
            hint={`+${data.shiftsLast7d} ב-7 הימים האחרונים`}
            icon={<CalendarClock className="h-4 w-4" />}
            accent="bg-amber-500/70"
          />
          <MetricCard
            label="הצטרפויות (7 ימים)"
            value={data.signupsLast7d.toLocaleString("he-IL")}
            hint="ארגונים חדשים שהוקמו"
            icon={<UserPlus className="h-4 w-4" />}
            accent="bg-fuchsia-500/70"
          />
          <MetricCard
            label="ארגונים פעילים (7 ימים)"
            value={data.activeOrgsLast7d.toLocaleString("he-IL")}
            hint="ארגונים עם פעילות יומן"
            icon={<Activity className="h-4 w-4" />}
            accent="bg-rose-500/70"
          />
          <MetricCard
            label="קצב משמרות"
            value={`${data.shiftsLast7d.toLocaleString("he-IL")}`}
            hint="משמרות שנוצרו השבוע"
            icon={<TrendingUp className="h-4 w-4" />}
            accent="bg-teal-500/70"
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <SystemHealthCard />
        </div>
        <div className="lg:col-span-2">
          <ActivityCharts />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">קיצורי דרך</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
          <a
            href="/admin/orgs"
            className="rounded-lg border border-border p-4 hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <div className="font-medium">ניהול ארגונים</div>
            <div className="mt-1 text-xs text-muted-foreground">
              צפייה ב-{data?.totalOrgs ?? "—"} ארגונים, חיפוש ופעולות
            </div>
          </a>
          <a
            href="/admin/users"
            className="rounded-lg border border-border p-4 hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <div className="font-medium">משתמשים</div>
            <div className="mt-1 text-xs text-muted-foreground">
              רשימת המשתמשים והשיוכים שלהם
            </div>
          </a>
          <a
            href="/admin/audit"
            className="rounded-lg border border-border p-4 hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <div className="font-medium">יומן ביקורת</div>
            <div className="mt-1 text-xs text-muted-foreground">
              לוג פעולות בכל הארגונים
            </div>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
