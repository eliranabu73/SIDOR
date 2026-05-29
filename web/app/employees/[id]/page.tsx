"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, CalendarDays, Palmtree } from "lucide-react";
import { DateTime } from "luxon";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { vacationDaysForSeniority } from "@/lib/tenure";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { SafeAreaPadding } from "@/components/ui/safe-area-padding";
import { AvailabilityGrid } from "@/components/employees/AvailabilityGrid";
import { ConstraintsForm } from "@/components/employees/ConstraintsForm";
import { TimeOffList } from "@/components/employees/TimeOffList";
import { useEmployees } from "@/lib/queries";

interface Params {
  id: string;
}

interface PageProps {
  params: Promise<Params>;
}

export default function EmployeeDetailPage({ params }: PageProps) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <AppShell>
        <EmployeeDetailInner employeeId={id} />
      </AppShell>
    </AuthGuard>
  );
}

const VALID_TABS = ["details", "availability", "constraints", "timeoff"] as const;
type TabKey = (typeof VALID_TABS)[number];

function isTab(v: string | null): v is TabKey {
  return v != null && (VALID_TABS as readonly string[]).includes(v);
}

function EmployeeDetailInner({ employeeId }: { employeeId: string }) {
  const employeesQuery = useEmployees();
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get("tab");
  const [tab, setTab] = React.useState<TabKey>(
    isTab(initialTab) ? initialTab : "details",
  );

  const employee = (employeesQuery.data ?? []).find((e) => e.id === employeeId);

  return (
    <SafeAreaPadding bottom className="mx-auto max-w-5xl p-4 sm:p-6">
      <nav className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/employees" className="hover:text-foreground">
          עובדים
        </Link>
        <ChevronRight className="h-4 w-4 rotate-180" />
        <span className="text-foreground">
          {employee?.fullName ?? "פרטי עובד/ת"}
        </span>
      </nav>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">
          {employee?.fullName ?? "…"}
        </h1>
        {employee?.roles?.length ? (
          <div className="text-sm text-muted-foreground">
            {employee.roles.join(" · ")}
          </div>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        {/* On mobile the tab strip scrolls horizontally so all 4 stay reachable
            with one thumb without wrapping into 2 rows on small screens. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
          <TabsList className="w-max sm:w-auto">
            <TabsTrigger value="details">פרטים</TabsTrigger>
            <TabsTrigger value="availability">זמינות</TabsTrigger>
            <TabsTrigger value="constraints">אילוצים</TabsTrigger>
            <TabsTrigger value="timeoff">חופשות</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="details">
          {employeesQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : employee ? (
            <div className="space-y-3">
              <SeniorityStats
                hireDate={employee.hireDate ?? null}
              />
              <DetailsBlock employee={employee} />
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              העובד/ת לא נמצא/ה.
            </div>
          )}
        </TabsContent>

        <TabsContent value="availability">
          <AvailabilityGrid employeeId={employeeId} />
        </TabsContent>

        <TabsContent value="constraints">
          <ConstraintsForm employeeId={employeeId} />
        </TabsContent>

        <TabsContent value="timeoff">
          <TimeOffList employeeId={employeeId} />
        </TabsContent>
      </Tabs>
    </SafeAreaPadding>
  );
}

interface DetailsEmployee {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  roles: string[];
  active: boolean;
}

function SeniorityStats({ hireDate }: { hireDate: string | null }) {
  if (!hireDate) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          לא הוגדר תאריך תחילת עבודה — ערוך את כרטיס העובד/ת כדי לחשב ותק וחופשה.
        </CardContent>
      </Card>
    );
  }
  const dt = DateTime.fromISO(hireDate);
  const yearsRaw = dt.isValid ? Math.abs(dt.diffNow("years").years) : 0;
  const years = Math.round(yearsRaw * 10) / 10;
  const vacationDays = vacationDaysForSeniority(Math.floor(yearsRaw));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card className="glass-card">
        <CardContent className="flex items-center gap-3 p-4">
          <CalendarDays className="h-5 w-5 text-indigo-500" />
          <div>
            <div className="text-xs text-muted-foreground">ותק</div>
            <div className="text-lg font-semibold">{years} שנים</div>
          </div>
        </CardContent>
      </Card>
      <Card className="glass-card">
        <CardContent className="flex items-center gap-3 p-4">
          <Palmtree className="h-5 w-5 text-emerald-500" />
          <div>
            <div className="text-xs text-muted-foreground">ימי חופשה שנתיים</div>
            <div className="text-lg font-semibold">{vacationDays} ימים</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailsBlock({ employee }: { employee: DetailsEmployee }) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-2">
      <Row label="שם מלא" value={employee.fullName} />
      <Row label="דוא״ל" value={employee.email ?? "—"} />
      <Row label="טלפון" value={employee.phone ?? "—"} />
      <Row
        label="סטטוס"
        value={employee.active ? "פעיל/ה" : "לא פעיל/ה"}
      />
      <Row
        label="תפקידים"
        value={employee.roles.length ? employee.roles.join(", ") : "—"}
      />
      <div className="sm:col-span-2 pt-2">
        <Link
          href="/employees"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          לעריכת פרטי עובד/ת מלאים, חזרו לעמוד העובדים
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
