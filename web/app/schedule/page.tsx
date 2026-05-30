"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { DateTime } from "luxon";
import { ArrowLeft, Check, ClipboardList, Copy, Filter, MessageCircle, Printer, Search, Send, Sparkles, Upload, Users as UsersIcon, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import {
  ApiError,
  approveSchedule,
  fetchMe,
  rejectSchedule,
  submitScheduleForApproval,
} from "@/lib/api";
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
import { AssignEmployeeSheet } from "@/components/schedule/AssignEmployeeSheet";
import { WeeklyGrid } from "@/components/schedule/WeeklyGrid";
import { QuickAddShiftSheet } from "@/components/schedule/QuickAddShiftSheet";
import { QuickAddEmployeesDialog } from "@/components/schedule/dialogs/QuickAddEmployeesDialog";
import {
  SetupChecklist,
  clearSetupChecklistDismissal,
  isSetupChecklistDismissed,
} from "@/components/schedule/SetupChecklist";
// LaborCostBar, CostMeter, ComplianceBanner hidden for small-business simplicity
// import { LaborCostBar } from "@/components/schedule/LaborCostBar";
// import { CostMeter } from "@/components/schedule/CostMeter";
// import { ComplianceBanner } from "@/components/schedule/ComplianceBanner";
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
  useCopyFromPreviousWeek,
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
  const [createShiftPreset, setCreateShiftPreset] = React.useState<string | undefined>(
    undefined,
  );
  const [quickAddEmployeesOpen, setQuickAddEmployeesOpen] = React.useState(false);
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
  const copyWeek = useCopyFromPreviousWeek();

  // Current-user query — drives which approval action buttons are shown.
  // We rely on /v1/me which returns the active role (lowercased) along with
  // the membership list, so we don't need to re-derive it from the JWT.
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    enabled: !isDemo,
    staleTime: 5 * 60_000,
  });
  const role = (meQ.data?.user.role ?? "").toLowerCase();
  const isOwner = role === "owner";
  const isManager = role === "manager";
  const isBranchManager = role === "branch_manager";
  const canApprove = isOwner || isManager;

  const [approving, setApproving] = React.useState(false);

  // ── DnD state (lifted from ScheduleBoard so EmployeeCard sources live INSIDE DndContext)
  const [activeEmployeeId, setActiveEmployeeId] = React.useState<string | null>(null);
  const [validationByShift, setValidationByShift] = React.useState<
    Record<string, ShiftValidationTone>
  >({});
  const [pendingDrop, setPendingDrop] = React.useState<PendingDrop | null>(null);
  // Shift-first assignment — when set, the AssignEmployeeSheet shows for this shift.
  const [assignShift, setAssignShift] = React.useState<Shift | null>(null);

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

  const scheduleStatus = scheduleQuery.data?.status ?? null;

  const submitForApproval = async () => {
    if (!scheduleQuery.data) return;
    if (blockIfDemo()) return;
    setApproving(true);
    try {
      await submitScheduleForApproval(scheduleQuery.data.id);
      toast.success("הסידור נשלח לאישור הבעלים");
      scheduleQueryReal.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שליחה לאישור נכשלה");
    } finally {
      setApproving(false);
    }
  };

  const approve = async () => {
    if (!scheduleQuery.data) return;
    if (blockIfDemo()) return;
    setApproving(true);
    try {
      await approveSchedule(scheduleQuery.data.id);
      toast.success("הסידור אושר");
      scheduleQueryReal.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "האישור נכשל");
    } finally {
      setApproving(false);
    }
  };

  const reject = async () => {
    if (!scheduleQuery.data) return;
    if (blockIfDemo()) return;
    const note = window.prompt("הערה למנהל הסניף (אופציונלי):") ?? undefined;
    setApproving(true);
    try {
      await rejectSchedule(scheduleQuery.data.id, note);
      toast.success("הסידור הוחזר לעריכה");
      scheduleQueryReal.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "הדחייה נכשלה");
    } finally {
      setApproving(false);
    }
  };

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

  const handleRequestAssign = (shift: Shift) => {
    setAssignShift(shift);
  };

  const handleSheetAssign = (employee: Employee) => {
    if (!assignShift) return;
    if (
      assignShift.assignments.some(
        (a) => a.employeeId === employee.id && a.status === "assigned",
      )
    ) {
      toast.info("העובד/ת כבר משובץ/ת במשמרת זו");
      return;
    }
    void performAssign({
      shift: assignShift,
      employeeId: employee.id,
      acknowledgeWarnings: false,
    });
    setAssignShift(null);
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
  // Weekly vs daily view toggle — weekly is the new default
  const [viewMode, setViewMode] = React.useState<"weekly" | "daily">("weekly");
  // Quick-add sheet state — opened when user taps an empty cell in WeeklyGrid
  const [quickAddEmployee, setQuickAddEmployee] = React.useState<Employee | null>(null);
  const [quickAddDate, setQuickAddDate] = React.useState<DateTime | null>(null);
  const [quickAddOpen, setQuickAddOpen] = React.useState(false);

  const handleQuickAdd = React.useCallback((employeeId: string, date: DateTime) => {
    const emp = employees.find((e) => e.id === employeeId) ?? null;
    setQuickAddEmployee(emp);
    setQuickAddDate(date);
    setQuickAddOpen(true);
  }, [employees]);

  /** Day-level "+" button — no employee pre-selected, picker shown inside sheet. */
  const handleAddForDay = React.useCallback((date: DateTime) => {
    setQuickAddEmployee(null);
    setQuickAddDate(date);
    setQuickAddOpen(true);
  }, []);
  // Tracks whether the setup checklist was dismissed (so we can show a
  // "הצג רשימת התקנה" button in the toolbar that brings it back).
  const [checklistDismissed, setChecklistDismissed] = React.useState(false);
  React.useEffect(() => {
    setChecklistDismissed(isSetupChecklistDismissed());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "setupChecklistDismissed") {
        setChecklistDismissed(e.newValue === "true");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const showSetupChecklist = () => {
    clearSetupChecklistDismissal();
    setChecklistDismissed(false);
  };

  const publishNow = async () => {
    if (!scheduleQuery.data) return;
    if (blockIfDemo()) return;
    try {
      await publish.mutateAsync(scheduleQuery.data.id);
      toast.success("הסידור פורסם — בחרו כיצד לשתף");
      // Auto-open the share dialog so the user sees templates + WhatsApp options.
      // Without this, on mobile the user only sees a toast and nothing happens.
      setExportOpen(true);
    } catch {
      toast.error("פרסום הסידור נכשל");
    }
  };

  const copyFromPreviousWeek = async () => {
    if (!scheduleQuery.data) return;
    if (blockIfDemo()) return;
    try {
      const res = await copyWeek.mutateAsync(scheduleQuery.data.id);
      if (res.copied > 0) {
        toast.success(`הועתקו ${res.copied} משמרות מהשבוע הקודם`);
      } else {
        toast.info("אין משמרות בשבוע הקודם להעתקה");
      }
    } catch {
      toast.error("העתקת השבוע הקודם נכשלה");
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      <h1 className="sr-only">סידור עבודה</h1>
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-3 border-b bg-card px-3 sm:px-4 py-2 flex-wrap">
        <div className="font-semibold truncate max-w-[140px] sm:max-w-none">{mockOrg.name}</div>
        <WeekSelector weekStart={weekStart} onChange={setWeekStart} />
        {/* View mode toggle — weekly / daily */}
        <div className="flex rounded-md border overflow-hidden text-sm h-9 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("weekly")}
            className={`px-3 py-1 transition-colors ${
              viewMode === "weekly"
                ? "bg-indigo-500 text-white font-medium"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            שבועי
          </button>
          <button
            type="button"
            onClick={() => setViewMode("daily")}
            className={`px-3 py-1 border-s transition-colors ${
              viewMode === "daily"
                ? "bg-indigo-500 text-white font-medium"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            יומי
          </button>
        </div>
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
        {checklistDismissed && (
          <Button
            variant="outline"
            size="sm"
            onClick={showSetupChecklist}
            className="h-11 sm:h-10"
            aria-label="הצג רשימת התקנה"
            title="הצג רשימת התקנה"
          >
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">רשימת התקנה</span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={copyFromPreviousWeek}
          disabled={!scheduleQuery.data || copyWeek.isPending}
          className="h-11 sm:h-10"
          aria-label="העתק שבוע קודם"
          title="העתק את שלד המשמרות מהשבוע הקודם (בלי השיבוצים)"
        >
          <Copy className="h-4 w-4" />
          <span className="hidden sm:inline">
            {copyWeek.isPending ? "מעתיק…" : "העתק שבוע קודם"}
          </span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (blockIfDemo()) return;
            setAutoOpen(true);
          }}
          disabled={!scheduleQuery.data}
          className="h-11 sm:h-10"
          aria-label="שיבוץ אוטומטי"
          title="שיבוץ אוטומטי"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">שיבוץ אוטומטי</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExportOpen(true)}
          disabled={!scheduleQuery.data}
          title="ייצוא ושיתוף — תמונה או PDF"
          className="h-11 sm:h-10"
          aria-label="ייצוא ושיתוף"
        >
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">ייצוא ושיתוף</span>
        </Button>
        <Button
          variant="glow"
          size="sm"
          onClick={() => {
            if (blockIfDemo()) return;
            setPublishOpen(true);
          }}
          disabled={!scheduleQuery.data}
          title="פרסום בוואטסאפ עם קישור אישי לכל עובד"
          className="h-11 sm:h-10"
          aria-label="פרסום ב-WhatsApp"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="hidden sm:inline">פרסום ב-WhatsApp</span>
        </Button>
        {/* Approval workflow buttons — replace publish for branch managers, add review actions for owners. */}
        {isBranchManager && scheduleStatus === "draft" ? (
          <Button
            onClick={submitForApproval}
            disabled={approving || !scheduleQuery.data}
            className="h-11 sm:h-10"
            title="שלח את הסידור לאישור הבעלים"
          >
            <Send className="h-4 w-4" />
            {approving ? "שולח…" : "שלח לאישור"}
          </Button>
        ) : isBranchManager && scheduleStatus === "pending_approval" ? (
          <Button disabled className="h-11 sm:h-10">
            ממתין לאישור הבעלים…
          </Button>
        ) : canApprove && scheduleStatus === "pending_approval" ? (
          <>
            <Button
              variant="outline"
              onClick={reject}
              disabled={approving}
              className="h-11 sm:h-10"
              title="החזר את הסידור לעריכה למנהל הסניף"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">החזר לעריכה</span>
            </Button>
            <Button
              variant="glow"
              onClick={approve}
              disabled={approving}
              className="h-11 sm:h-10"
              title="אשר את הסידור"
            >
              <Check className="h-4 w-4" />
              {approving ? "מאשר…" : "אשר סידור"}
            </Button>
          </>
        ) : (
          <Button
            onClick={publishNow}
            disabled={publish.isPending || !scheduleQuery.data}
            className="h-11 sm:h-10"
            title="שמירה כסידור פורסם + פתיחת חלון שיתוף"
          >
            <Upload className="h-4 w-4" />
            {publish.isPending ? "מפרסם…" : "פרסם ושתף"}
          </Button>
        )}
      </div>

      {/* Labor cost bar — hidden for small-business simplicity */}
      {/* <LaborCostBar weekStart={weekStart} /> */}

      {/* Compliance banner — hidden for small-business simplicity */}
      {/* <ComplianceBanner scheduleId={scheduleQuery.data?.id ?? null} /> */}

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
          {/* CostMeter hidden for small-business simplicity */}
          {/* <CostMeter scheduleId={scheduleQuery.data?.id ?? null} /> */}
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
                  setCreateShiftPreset(undefined);
                  setCreateShiftOpen(true);
                }}
                onAutoSchedule={() => {
                  if (blockIfDemo()) return;
                  setAutoOpen(true);
                }}
                onCreateFromPreset={(name) => {
                  if (blockIfDemo()) return;
                  setCreateShiftPreset(name || undefined);
                  setCreateShiftOpen(true);
                }}
              />
            ) : viewMode === "weekly" ? (
              <WeeklyGrid
                schedule={scheduleQuery.data}
                employees={visibleEmployees}
                weekStart={weekStart}
                locationFilter={locationFilter}
                roleFilter={roleFilter}
                onQuickAdd={handleQuickAdd}
                onAddForDay={handleAddForDay}
                onUnassign={unassign}
                onRequestAssign={handleRequestAssign}
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
                onRequestAssign={handleRequestAssign}
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
                  /* Drawer is now a secondary path — main flow is shift-first. */
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
                  /* Mobile drawer keeps drag-handle for power users; primary flow opens AssignEmployeeSheet from a shift tap. */
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
        onOpenChange={(open) => {
          setCreateShiftOpen(open);
          if (!open) setCreateShiftPreset(undefined);
        }}
        weekStart={weekStart}
        scheduleId={scheduleQuery.data?.id ?? null}
        initialTemplateName={createShiftPreset}
      />

      <QuickAddEmployeesDialog
        open={quickAddEmployeesOpen}
        onOpenChange={setQuickAddEmployeesOpen}
      />

      {/* Quick-add shift sheet — opened from WeeklyGrid empty cell tap. */}
      <QuickAddShiftSheet
        open={quickAddOpen}
        onOpenChange={(v) => {
          setQuickAddOpen(v);
          if (!v) { setQuickAddEmployee(null); setQuickAddDate(null); }
        }}
        employee={quickAddEmployee}
        employees={visibleEmployees}
        date={quickAddDate}
        weekStart={weekStart}
        scheduleId={scheduleQuery.data?.id}
      />

      {/* Shift-first assignment sheet — primary path on mobile + desktop. */}
      <AssignEmployeeSheet
        shift={assignShift}
        open={assignShift !== null}
        onOpenChange={(open) => {
          if (!open) setAssignShift(null);
        }}
        employees={employees}
        metricsByEmployee={metricsByEmployee}
        onAssign={handleSheetAssign}
        locationFilter={locationFilter}
        onAddFirstEmployee={() => {
          if (blockIfDemo()) return;
          setQuickAddEmployeesOpen(true);
        }}
      />

      {/* Setup checklist — floating bottom-start on desktop, top banner on mobile.
         Self-contained: reads useOnboardingProgress() and auto-hides when done. */}
      {!isDemo && <SetupChecklist />}

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
