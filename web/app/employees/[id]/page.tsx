"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
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
        <TabsList>
          <TabsTrigger value="details">פרטים</TabsTrigger>
          <TabsTrigger value="availability">זמינות</TabsTrigger>
          <TabsTrigger value="constraints">אילוצים</TabsTrigger>
          <TabsTrigger value="timeoff">חופשות</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          {employeesQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : employee ? (
            <DetailsBlock employee={employee} />
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
    </div>
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
