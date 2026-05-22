"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { Printer, Search, Sparkles, Upload } from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";
import { EmployeeCard } from "@/components/schedule/EmployeeCard";
import {
  WeekSelector,
  startOfWeekSunday,
} from "@/components/schedule/WeekSelector";
import { AutoScheduleDialog } from "@/components/schedule/AutoScheduleDialog";
import { ProposalOverlay } from "@/components/schedule/ProposalOverlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { mockLocations, mockOrg } from "@/lib/mocks";
import {
  useApplyProposals,
  useAutoSchedule,
  useEmployeeMetrics,
  useEmployees,
  usePublishSchedule,
  useSchedule,
} from "@/lib/queries";
import { toast } from "sonner";
import type {
  AssignmentProposal,
  AutoScheduleWeights,
} from "@/lib/types";

export default function SchedulePage() {
  return (
    <AuthGuard>
      <AppShell>
        <ScheduleInner />
      </AppShell>
    </AuthGuard>
  );
}

function ScheduleInner() {
  const [weekStart, setWeekStart] = React.useState<DateTime>(() =>
    startOfWeekSunday(DateTime.now()),
  );
  const [locationFilter, setLocationFilter] = React.useState<string | "all">("all");
  const [roleFilter, setRoleFilter] = React.useState<string | "all">("all");
  const [search, setSearch] = React.useState("");
  const [autoOpen, setAutoOpen] = React.useState(false);
  const [pendingProposals, setPendingProposals] = React.useState<
    AssignmentProposal[] | null
  >(null);

  const scheduleQuery = useSchedule(
    `sched_${weekStart.toISODate()}`,
    weekStart.toISO() ?? undefined,
  );
  const employeesQuery = useEmployees();
  const metricsQuery = useEmployeeMetrics();
  const autoSchedule = useAutoSchedule();
  const applyProposals = useApplyProposals();
  const publish = usePublishSchedule();

  const employees = employeesQuery.data ?? [];
  const metricsByEmployee = React.useMemo(() => {
    const map: Record<string, { employeeId: string; weeklyAssignedMinutes: number; weeklyTargetMinutes: number; fairnessScore: number } | undefined> = {};
    for (const m of metricsQuery.data ?? []) map[m.employeeId] = m;
    return map;
  }, [metricsQuery.data]);

  const allRoles = React.useMemo(() => {
    const set = new Set<string>();
    for (const s of scheduleQuery.data?.shifts ?? []) set.add(s.role);
    return Array.from(set).sort();
  }, [scheduleQuery.data]);

  const visibleEmployees = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (!e.active) return false;
      if (locationFilter !== "all" && e.primaryLocationId !== locationFilter)
        return false;
      if (roleFilter !== "all" && !e.roles.includes(roleFilter)) return false;
      if (q && !e.fullName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [employees, search, locationFilter, roleFilter]);

  const onPreviewAuto = async (weights: AutoScheduleWeights) => {
    if (!scheduleQuery.data) return [];
    const res = await autoSchedule.mutateAsync({
      scheduleId: scheduleQuery.data.id,
      dryRun: true,
      weights,
    });
    return res.proposals;
  };

  const onApplyAuto = async (proposals: AssignmentProposal[]) => {
    if (!scheduleQuery.data) return;
    setPendingProposals(proposals);
  };

  const applyNow = async () => {
    if (!scheduleQuery.data || !pendingProposals) return;
    await applyProposals.mutateAsync({
      scheduleId: scheduleQuery.data.id,
      proposals: pendingProposals,
    });
    toast.success("הצעות השיבוץ הוחלו");
    setPendingProposals(null);
  };

  const publishNow = async () => {
    if (!scheduleQuery.data) return;
    try {
      await publish.mutateAsync(scheduleQuery.data.id);
      toast.success("הסידור פורסם");
    } catch {
      toast.error("פרסום הסידור נכשל");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b bg-card px-4 py-2 flex-wrap">
        <div className="font-semibold">{mockOrg.name}</div>
        <WeekSelector weekStart={weekStart} onChange={setWeekStart} />
        <div className="me-auto" />
        <Button
          variant="outline"
          onClick={() => setAutoOpen(true)}
          disabled={!scheduleQuery.data}
        >
          <Sparkles className="h-4 w-4" />
          שיבוץ אוטומטי
        </Button>
        <Button
          variant="outline"
          onClick={() => window.print()}
          disabled={!scheduleQuery.data}
          title="ייצא ל-PDF / הדפסה לשליחה ב-WhatsApp"
        >
          <Printer className="h-4 w-4" />
          ייצוא לעובדים
        </Button>
        <Button onClick={publishNow} disabled={publish.isPending || !scheduleQuery.data}>
          <Upload className="h-4 w-4" />
          {publish.isPending ? "מפרסם…" : "פרסם סידור"}
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left rail — filters */}
        <aside className="w-60 shrink-0 border-e bg-muted/30 p-3 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold mb-1 block">חיפוש עובד/ת</label>
              <div className="relative">
                <Search className="h-4 w-4 absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="שם…"
                  className="pe-8"
                  aria-label="חיפוש עובד/ת"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">סניף</label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                aria-label="סינון לפי סניף"
              >
                <option value="all">כל הסניפים</option>
                {mockLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">תפקיד</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                aria-label="סינון לפי תפקיד"
              >
                <option value="all">כל התפקידים</option>
                {allRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </aside>

        {/* Center — board */}
        <section className="flex-1 min-w-0 overflow-auto p-3">
          {scheduleQuery.isLoading ? (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-96" />
              ))}
            </div>
          ) : scheduleQuery.isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
              שגיאה בטעינת הסידור
            </div>
          ) : scheduleQuery.data ? (
            <ScheduleBoard
              schedule={scheduleQuery.data}
              employees={employees}
              weekStart={weekStart}
              locationFilter={locationFilter}
              roleFilter={roleFilter}
            />
          ) : null}
        </section>

        {/* Right rail — employees */}
        <aside className="w-72 shrink-0 border-s bg-muted/30 p-3 overflow-y-auto">
          <div className="text-xs font-semibold mb-2 flex items-center justify-between">
            <span>עובדים זמינים</span>
            <span className="text-muted-foreground tabular-nums">
              {visibleEmployees.length}
            </span>
          </div>
          {employeesQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleEmployees.map((e) => (
                <EmployeeCard
                  key={e.id}
                  employee={e}
                  metrics={metricsByEmployee[e.id]}
                />
              ))}
              {visibleEmployees.length === 0 ? (
                <div className="text-xs text-muted-foreground p-3 text-center">
                  אין עובדים תואמים
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>

      <AutoScheduleDialog
        open={autoOpen}
        onOpenChange={setAutoOpen}
        onPreview={onPreviewAuto}
        onApply={onApplyAuto}
        loading={autoSchedule.isPending}
      />
      <ProposalOverlay
        proposals={pendingProposals}
        onApply={() => void applyNow()}
        onDismiss={() => setPendingProposals(null)}
        pending={applyProposals.isPending}
      />
    </div>
  );
}
