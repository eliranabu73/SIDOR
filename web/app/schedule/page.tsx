"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { DateTime } from "luxon";
import { ArrowLeft, Filter, MessageCircle, Printer, Search, Sparkles, Upload, Users as UsersIcon } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ApiError } from "@/lib/api";
import { useAssignMutation, useValidateAssignment } from "@/lib/queries";
import { ConfirmWarningsDialog } from "@/components/schedule/ConfirmWarningsDialog";
import type { AssignBody, ApiErrorBody, Employee, RuleResult, Shift } from "@/lib/types";
import type { ShiftValidationTone } from "@/components/schedule/ShiftCard";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
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
import { ConfirmationStatus } from "@/components/schedule/ConfirmationStatus";
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
  useLocations,
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

interface PendingDrop {
  shiftId: string;
  employeeId: string;
  expectedShiftVersion: number;
  warnings: RuleResult[];
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
  const [signupPromptOpen, setSignupPromptOpen] = React.useState(false);
  const [pendingProposals, setPendingProposals] = React.useState<
    AssignmentProposal[] | null
  >(null);

  const scheduleQueryReal = useSchedule(
    `sched_${weekStart.toISODate()}`,
    weekStart.toISO() ?? undefined,
  );
  const employeesQuery = useEmployees();
  const metricsQuery = useEmployeeMetrics();
  const locationsQuery = useLocations();
  const autoSchedule = useAutoSchedule();
  const applyProposals = useApplyProposals();
  const publish = usePublishSchedule();

  // ── DnD state (lifted from ScheduleBoard so EmployeeCard sources live INSIDE DndContext)
  const [activeEmployeeId, setActiveEmployeeId] = React.useState<string | null>(null);
  const [validationByShift, setValidationByShift] = React.useState<
    Record<string, ShiftValidationTone>
  >({});
  const [pendingDrop, setPendingDrop] = React.useState<PendingDrop | null>(null);
  // Tap-to-assign (mobile)
  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const validate = useValidateAssignment();
  const assign = useAssignMutation({
    onError: (err) => {
      const status = (err as unknown as { status?: number }).status;
      const body = (err as unknown as { body?: ApiErrorBody }).body ?? undefined;
      if (status === 409 && body?.code === "VERSION_MISMATCH") {
        toast.error("המשמרת התעדכנה, מרענן…");
        return;
      }
      // WARNINGS_REQUIRE_ACK is handled via dialog — suppress the toast.
      if (status === 409 && body?.code === "WARNINGS_REQUIRE_ACK") return;
      if (status === 422 && body?.code === "CONSTRAINTS_VIOLATED") {
        const lines = (body.violations ?? []).map((v) => v.message).join(", ");
        toast.error(`השיבוץ נכשל: ${lines || "הפרות חוקים"}`);
        return;
      }
      toast.error((err as Error).message || "השיבוץ נכשל");
    },
    onSuccess: () => toast.success("שיבוץ בוצע"),
  });

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setSignupPromptOpen(true);
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

  // ── DnD handlers
  const onDragStart = (e: DragStartEvent) => {
    const empId = (e.active.data.current as { employeeId?: string } | undefined)?.employeeId;
    setActiveEmployeeId(empId ?? null);
    setValidationByShift({});
  };

  const onDragOver = (e: DragOverEvent) => {
    const over = e.over;
    const active = e.active;
    if (!over) return;
    const overData = over.data.current as { type?: string; shiftId?: string } | undefined;
    const activeData = active.data.current as { type?: string; employeeId?: string } | undefined;
    if (overData?.type !== "shift" || !overData.shiftId) return;
    if (activeData?.type !== "employee" || !activeData.employeeId) return;
    const shiftId = overData.shiftId;
    const employeeId = activeData.employeeId;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      validate.mutate(
        { shiftId, employeeId, action: "assign" },
        {
          onSuccess: (res) => {
            setValidationByShift((prev) => ({
              ...prev,
              [shiftId]:
                res.violations.length > 0
                  ? "error"
                  : res.warnings.length > 0
                    ? "warning"
                    : "ok",
            }));
          },
          onError: () => {
            setValidationByShift((prev) => ({ ...prev, [shiftId]: "neutral" }));
          },
        },
      );
    }, 200);
  };

  const performAssign = async ({
    shift,
    employeeId,
    acknowledgeWarnings,
    knownTone,
  }: {
    shift: Shift;
    employeeId: string;
    acknowledgeWarnings: boolean;
    knownTone?: ShiftValidationTone;
  }) => {
    const body: AssignBody = {
      action: "assign",
      employeeId,
      expectedShiftVersion: shift.version,
      acknowledgeWarnings,
    };
    try {
      await assign.mutateAsync({ shiftId: shift.id, body });
    } catch (err) {
      if (err instanceof ApiError) {
        const apiBody = err.body as ApiErrorBody | null;
        if (err.status === 409 && apiBody?.code === "WARNINGS_REQUIRE_ACK") {
          setPendingDrop({
            shiftId: shift.id,
            employeeId,
            expectedShiftVersion: shift.version,
            warnings: apiBody.warnings ?? [],
          });
          return;
        }
      }
      void knownTone;
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setActiveEmployeeId(null);
    const over = e.over;
    const active = e.active;
    const tonesSnapshot = validationByShift;
    setValidationByShift({});
    if (!over) return;
    const overData = over.data.current as { type?: string; shiftId?: string } | undefined;
    const activeData = active.data.current as { type?: string; employeeId?: string } | undefined;
    if (overData?.type !== "shift" || !overData.shiftId) return;
    if (activeData?.type !== "employee" || !activeData.employeeId) return;
    const shift = scheduleQuery.data?.shifts.find((s) => s.id === overData.shiftId);
    if (!shift) return;
    if (
      shift.assignments.some(
        (a) => a.employeeId === activeData.employeeId && a.status === "assigned",
      )
    ) {
      toast.info("העובד/ת כבר משובץ/ת במשמרת זו");
      return;
    }
    void performAssign({
      shift,
      employeeId: activeData.employeeId,
      acknowledgeWarnings: false,
      knownTone: tonesSnapshot[shift.id],
    });
  };

  const confirmWarnings = async () => {
    if (!pendingDrop) return;
    const shift = scheduleQuery.data?.shifts.find((s) => s.id === pendingDrop.shiftId);
    if (!shift) {
      setPendingDrop(null);
      return;
    }
    await performAssign({
      shift,
      employeeId: pendingDrop.employeeId,
      acknowledgeWarnings: true,
    });
    setPendingDrop(null);
  };

  const unassign = (shift: Shift, employeeId: string) => {
    assign.mutate({
      shiftId: shift.id,
      body: {
        action: "unassign",
        employeeId,
        expectedShiftVersion: shift.version,
      },
    });
  };

  const handleTapAssign = (shift: Shift) => {
    if (!selectedEmployeeId) return;
    if (
      shift.assignments.some(
        (a) => a.employeeId === selectedEmployeeId && a.status === "assigned",
      )
    ) {
      toast.info("העובד/ת כבר משובץ/ת במשמרת זו");
      return;
    }
    void performAssign({
      shift,
      employeeId: selectedEmployeeId,
      acknowledgeWarnings: false,
    });
    setSelectedEmployeeId(null);
  };

  const activeEmployee = activeEmployeeId
    ? employees.find((e) => e.id === activeEmployeeId) ?? null
    : null;

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

      {/* Confirmation status — visible only when schedule is published */}
      {scheduleQuery.data?.status === "published" && scheduleQuery.data.id && (
        <div className="px-3 sm:px-4 pt-2 pb-1 max-w-md">
          <ConfirmationStatus
            scheduleId={scheduleQuery.data.id}
            isPublished
            weekLabel={weekStart.toISODate() ?? ""}
          />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        {/* Selected-employee bar (mobile only) */}
        {selectedEmployeeId && (() => {
          const selEmp = employees.find((e) => e.id === selectedEmployeeId);
          if (!selEmp) return null;
          return (
            <div className="sm:hidden sticky top-14 z-20 flex items-center gap-3 px-4 py-2.5 bg-primary text-primary-foreground border-b">
              <span className="text-sm font-medium flex-1 truncate">
                שיבוץ: {selEmp.fullName} — הקש על משמרת
              </span>
              <button
                type="button"
                onClick={() => setSelectedEmployeeId(null)}
                className="text-primary-foreground/70 hover:text-primary-foreground text-lg leading-none"
                aria-label="בטל בחירת עובד/ת"
              >
                ✕
              </button>
            </div>
          );
        })()}

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
                {(isDemo ? mockLocations : locationsQuery.data ?? []).map((l) => (
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
                validationByShift={validationByShift}
                activeEmployee={activeEmployee}
                onUnassign={unassign}
                selectedEmployeeId={selectedEmployeeId}
                onTapAssign={handleTapAssign}
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
                  onSelect={() =>
                    setSelectedEmployeeId(
                      e.id === selectedEmployeeId ? null : e.id,
                    )
                  }
                  isSelected={e.id === selectedEmployeeId}
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

        <DragOverlay dropAnimation={null}>
          {activeEmployee ? (
            <DragChipInline
              employee={activeEmployee}
              tone={
                Object.values(validationByShift).includes("error")
                  ? "error"
                  : Object.values(validationByShift).includes("warning")
                    ? "warning"
                    : Object.values(validationByShift).includes("ok")
                      ? "ok"
                      : "neutral"
              }
            />
          ) : null}
        </DragOverlay>

        <ConfirmWarningsDialog
          open={pendingDrop !== null}
          warnings={pendingDrop?.warnings ?? []}
          onConfirm={() => void confirmWarnings()}
          onCancel={() => setPendingDrop(null)}
          pending={assign.isPending}
        />
      </DndContext>

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
                  onSelect={() => {
                    setSelectedEmployeeId(
                      e.id === selectedEmployeeId ? null : e.id,
                    );
                    setEmployeesPanelOpen(false);
                  }}
                  isSelected={e.id === selectedEmployeeId}
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

      {/* Signup prompt — replaces the old toast for demo-mode blocks */}
      <Dialog open={signupPromptOpen} onOpenChange={setSignupPromptOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-xl">רוצה להמשיך?</DialogTitle>
            <DialogDescription className="mt-2 text-base">
              זהו מצב הדגמה בלבד.
              <br />
              צור חשבון חינמי תוך 2 דקות כדי לשבץ, לפרסם ולשתף בוואטסאפ.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button asChild variant="glow" size="lg" className="w-full" onClick={() => setSignupPromptOpen(false)}>
              <Link href="/login">
                <Sparkles className="h-4 w-4" />
                הירשם חינם — ללא כרטיס אשראי
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSignupPromptOpen(false)}>
              המשך לצפות בהדגמה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DragChipInline({
  employee,
  tone,
}: {
  employee: Employee;
  tone: "neutral" | "ok" | "warning" | "error";
}) {
  const initials = employee.fullName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  void tone;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-sm font-medium shadow-lg select-none">
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px]"
      >
        {initials}
      </span>
      <span className="max-w-44 truncate">{employee.fullName}</span>
    </div>
  );
}
