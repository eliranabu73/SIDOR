"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { DateTime } from "luxon";
import { Filter, MessageCircle, Printer, Search, Sparkles, Upload, Users as UsersIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DemoBoundary, useDemoMode } from "@/components/auth/DemoBoundary";
import { DemoBanner } from "@/components/DemoBanner";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";

// Dynamically load the board (and its dnd-kit deps) to keep them out of the initial bundle.
const ScheduleBoard = dynamic(
  () => import("@/components/schedule/ScheduleBoard").then((m) => m.ScheduleBoard),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-24 sm:h-96" />
        ))}
      </div>
    ),
  },
);
import { EmptyScheduleState } from "@/components/schedule/EmptyScheduleState";
import { EmployeeCard } from "@/components/schedule/EmployeeCard";
import {
  WeekSelector,
  startOfWeekSunday,
} from "@/components/schedule/WeekSelector";
import { AutoScheduleDialog } from "@/components/schedule/AutoScheduleDialog";
import { ProposalOverlay } from "@/components/schedule/ProposalOverlay";
import { PublishWhatsAppDialog } from "@/components/schedule/PublishWhatsAppDialog";
import { ExportDialog } from "@/components/schedule/ExportDialog";
import { CreateShiftDialog } from "@/components/schedule/CreateShiftDialog";
import { LaborCostBar } from "@/components/schedule/LaborCostBar";
import { CostMeter } from "@/components/schedule/CostMeter";
import { ComplianceBanner } from "@/components/schedule/ComplianceBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildMockSchedule,
  mockEmployees,
  mockLocations,
  mockMetrics,
  mockOrg,
} from "@/lib/mocks";
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
    <DemoBoundary>
      <DemoBanner />
      <AppShell>
        <ScheduleInner />
      </AppShell>
    </DemoBoundary>
  );
}

function ScheduleInner() {
  const isDemo = useDemoMode();
  const [weekStart, setWeekStart] = React.useState<DateTime>(() =>
    startOfWeekSunday(DateTime.now()),
  );
  const [locationFilter, setLocationFilter] = React.useState<string | "all">("all");
  const [roleFilter, setRoleFilter] = React.useState<string | "all">("all");
  const [search, setSearch] = React.useState("");
  const [autoOpen, setAutoOpen] = React.useState(false);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [createShiftOpen, setCreateShiftOpen] = React.useState(false);
  const [pendingProposals, setPendingProposals] = React.useState<
    AssignmentProposal[] | null
  >(null);

  const scheduleQueryReal = useSchedule(
    `sched_${weekStart.toISODate()}`,
    weekStart.toISO() ?? undefined,
  );
  const employeesQuery = useEmployees();
  const metricsQuery = useEmployeeMetrics();
  const autoSchedule = useAutoSchedule();
  const applyProposals = useApplyProposals();
  const publish = usePublishSchedule();

  // In public-demo mode, force-feed seeded mocks instead of API responses
  // so the page is usable without auth or backend reachability.
  const demoSchedule = React.useMemo(
    () => (isDemo ? buildMockSchedule(weekStart) : null),
    [isDemo, weekStart],
  );

  const scheduleQuery = isDemo
    ? ({
        data: demoSchedule,
        isLoading: false,
        isError: false,
      } as const)
    : scheduleQueryReal;

  const employees = isDemo ? mockEmployees : employeesQuery.data ?? [];
  const employeesLoading = isDemo ? false : employeesQuery.isLoading;
  const metricsByEmployee = React.useMemo(() => {
    const map: Record<string, { employeeId: string; weeklyAssignedMinutes: number; weeklyTargetMinutes: number; fairnessScore: number } | undefined> = {};
    const source = isDemo ? mockMetrics : metricsQuery.data ?? [];
    for (const m of source) map[m.employeeId] = m;
    return map;
  }, [metricsQuery.data, isDemo]);

  /** Mutating-action guard for demo mode. Returns true if action was blocked. */
  const blockIfDemo = React.useCallback((): boolean => {
    if (!isDemo) return false;
    toast.info("התחבר כדי לערוך");
    return true;
  }, [isDemo]);

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
    if (blockIfDemo()) return [];
    const res = await autoSchedule.mutateAsync({
      scheduleId: scheduleQuery.data.id,
      dryRun: true,
      weights,
    });
    // Savings nudge — only when a previous week exists and we actually saved.
    if (res.costEstimate && res.costEstimate.deltaAgorot < 0) {
      const saved = Math.abs(res.costEstimate.deltaAgorot) / 100;
      toast.success(
        `חסכת ₪${saved.toLocaleString("he-IL", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      );
    }
    return res.proposals;
  };

  const onApplyAuto = async (proposals: AssignmentProposal[]) => {
    if (!scheduleQuery.data) return;
    if (blockIfDemo()) return;
    setPendingProposals(proposals);
  };

  const applyNow = async () => {
    if (!scheduleQuery.data || !pendingProposals) return;
    if (blockIfDemo()) return;
    await applyProposals.mutateAsync({
      scheduleId: scheduleQuery.data.id,
      proposals: pendingProposals,
    });
    toast.success("הצעות השיבוץ הוחלו");
    setPendingProposals(null);
  };

  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [employeesPanelOpen, setEmployeesPanelOpen] = React.useState(false);

  const publishNow = async () => {
    if (!scheduleQuery.data) return;
    if (blockIfDemo()) return;
    try {
      await publish.mutateAsync(scheduleQuery.data.id);
      toast.success("הסידור פורסם");
    } catch {
      toast.error("פרסום הסידור נכשל");
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <h1 className="sr-only">סידור עבודה</h1>
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-3 border-b bg-card px-3 sm:px-4 py-2 flex-wrap">
        <div className="font-semibold truncate max-w-[140px] sm:max-w-none">{mockOrg.name}</div>
        <WeekSelector weekStart={weekStart} onChange={setWeekStart} />
        <div className="me-auto" />
        {/* Mobile-only: filter + employees drawer triggers */}
        <Button
          variant="outline"
          size="sm"
          className="sm:hidden h-11"
          onClick={() => setFiltersOpen(true)}
          aria-label="סינון"
        >
          <Filter className="h-4 w-4" />
          סינון
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="sm:hidden h-11"
          onClick={() => setEmployeesPanelOpen(true)}
          aria-label="עובדים"
        >
          <UsersIcon className="h-4 w-4" />
          עובדים
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (blockIfDemo()) return;
            setAutoOpen(true);
          }}
          disabled={!scheduleQuery.data}
          className="hidden sm:inline-flex"
        >
          <Sparkles className="h-4 w-4" />
          שיבוץ אוטומטי
        </Button>
        <Button
          variant="outline"
          onClick={() => setExportOpen(true)}
          disabled={!scheduleQuery.data}
          title="ייצוא ושיתוף — תמונה או PDF"
          className="hidden sm:inline-flex"
        >
          <Printer className="h-4 w-4" />
          ייצוא ושיתוף
        </Button>
        <Button
          variant="glow"
          onClick={() => {
            if (blockIfDemo()) return;
            setPublishOpen(true);
          }}
          disabled={!scheduleQuery.data}
          title="פרסום בוואטסאפ עם קישור אישי לכל עובד"
          className="hidden sm:inline-flex"
        >
          <MessageCircle className="h-4 w-4" />
          פרסום ב-WhatsApp
        </Button>
        <Button
          onClick={publishNow}
          disabled={publish.isPending || !scheduleQuery.data}
          className="h-11 sm:h-10"
        >
          <Upload className="h-4 w-4" />
          {publish.isPending ? "מפרסם…" : "פרסם"}
        </Button>
      </div>

      {/* Labor cost bar — always visible above the board */}
      <LaborCostBar weekStart={weekStart} />

      {/* WS-E: IL labor-compliance status above the grid */}
      <ComplianceBanner scheduleId={scheduleQuery.data?.id ?? null} />

      <div className="flex flex-col sm:flex-row flex-1 min-h-0">
        {/* Left rail — filters (desktop only) */}
        <aside aria-label="סינון וחיפוש" className="hidden sm:block w-60 shrink-0 border-e bg-muted/30 p-3 overflow-y-auto">
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
        <section className="relative flex-1 min-w-0 overflow-auto p-2 sm:p-3">
          <CostMeter scheduleId={scheduleQuery.data?.id ?? null} />
          {scheduleQuery.isLoading ? (
            <div className="flex flex-col gap-2 sm:grid sm:grid-cols-7">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-24 sm:h-96" />
              ))}
            </div>
          ) : scheduleQuery.isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
              שגיאה בטעינת הסידור
            </div>
          ) : scheduleQuery.data ? (
            scheduleQuery.data.shifts.length === 0 ? (
              <EmptyScheduleState
                onCreateFirstShift={() => {
                  if (blockIfDemo()) return;
                  setCreateShiftOpen(true);
                }}
                onAutoSchedule={() => {
                  if (blockIfDemo()) return;
                  setAutoOpen(true);
                }}
              />
            ) : (
              <ScheduleBoard
                schedule={scheduleQuery.data}
                employees={employees}
                weekStart={weekStart}
                locationFilter={locationFilter}
                roleFilter={roleFilter}
              />
            )
          ) : null}
        </section>

        {/* Right rail — employees (desktop only) */}
        <aside aria-label="עובדים זמינים" className="hidden sm:block w-72 shrink-0 border-s bg-muted/30 p-3 overflow-y-auto">
          <div className="text-xs font-semibold mb-2 flex items-center justify-between">
            <span>עובדים זמינים</span>
            <span className="text-muted-foreground tabular-nums">
              {visibleEmployees.length}
            </span>
          </div>
          {employeesLoading ? (
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

      {/* Mobile filters drawer */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="sm:hidden w-[85%] max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>סינון</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold mb-1 block">חיפוש עובד/ת</label>
              <div className="relative">
                <Search className="h-4 w-4 absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="שם…"
                  className="pe-8 h-11"
                  aria-label="חיפוש עובד/ת"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">סניף</label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full h-11 rounded-md border bg-background px-2 text-sm"
                aria-label="סינון לפי סניף"
              >
                <option value="all">כל הסניפים</option>
                {mockLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">תפקיד</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full h-11 rounded-md border bg-background px-2 text-sm"
                aria-label="סינון לפי תפקיד"
              >
                <option value="all">כל התפקידים</option>
                {allRoles.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="border-t pt-3 space-y-2">
              <Button
                variant="outline"
                className="w-full h-11"
                onClick={() => {
                  if (blockIfDemo()) return;
                  setAutoOpen(true);
                  setFiltersOpen(false);
                }}
                disabled={!scheduleQuery.data}
              >
                <Sparkles className="h-4 w-4" />
                שיבוץ אוטומטי
              </Button>
              <Button
                variant="outline"
                className="w-full h-11"
                onClick={() => window.print()}
                disabled={!scheduleQuery.data}
              >
                <Printer className="h-4 w-4" />
                ייצוא PDF
              </Button>
              <Button
                variant="glow"
                className="w-full h-11"
                onClick={() => {
                  if (blockIfDemo()) return;
                  setPublishOpen(true);
                  setFiltersOpen(false);
                }}
                disabled={!scheduleQuery.data}
              >
                <MessageCircle className="h-4 w-4" />
                פרסום ב-WhatsApp
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Mobile employees drawer */}
      <Sheet open={employeesPanelOpen} onOpenChange={setEmployeesPanelOpen}>
        <SheetContent side="left" className="sm:hidden w-[85%] max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              עובדים זמינים
              <span className="ms-2 text-xs text-muted-foreground tabular-nums">
                {visibleEmployees.length}
              </span>
            </SheetTitle>
          </SheetHeader>
          {employeesLoading ? (
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
        </SheetContent>
      </Sheet>

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
      <PublishWhatsAppDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        scheduleId={scheduleQuery.data?.id ?? null}
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        scheduleId={scheduleQuery.data?.id ?? `sched_${weekStart.toISODate()}`}
        weekStart={weekStart.toISODate() ?? ""}
      />
      <CreateShiftDialog
        open={createShiftOpen}
        onOpenChange={setCreateShiftOpen}
        weekStart={weekStart}
        scheduleId={scheduleQuery.data?.id ?? null}
      />
    </div>
  );
}
