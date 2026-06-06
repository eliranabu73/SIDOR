"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { DateTime } from "luxon";
import { ArrowLeft, CalendarCog, Check, ChevronDown, ClipboardList, Copy, Filter, MessageCircle, Printer, Search, Send, Sparkles, Upload, Users as UsersIcon, Wand2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ensureSchedule,
  rejectSchedule,
  submitScheduleForApproval,
  generateFromTemplates,
  listShiftTemplates,
  type ShiftTemplate,
} from "@/lib/api";
import { DEFAULT_TEMPLATE_NAME } from "@/lib/rules-mapping";
import { useAssignMutation, useValidateAssignment, useDashboard, useEmployeeMetricsLazy } from "@/lib/queries";
import { ConfirmWarningsDialog } from "@/components/schedule/ConfirmWarningsDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
    // Reserve a realistic height so the swap from skeleton → real grid does not
    // shift the page (CLS). Mobile renders a tall day/week agenda, so each
    // placeholder row gets a generous min-height and the whole block reserves
    // most of the viewport — keeps Cumulative Layout Shift near zero.
    loading: () => (
      <div className="flex min-h-[70svh] flex-col gap-2 sm:grid sm:min-h-0 sm:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-40 sm:h-96" />
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
import { ConfirmationStatus, ConfirmationPill } from "@/components/schedule/ConfirmationStatus";
import { WeeklyGrid } from "@/components/schedule/WeeklyGrid";
import { RequestsInboxButton } from "@/components/schedule/RequestsInboxButton";
import { RequestLinksButton } from "@/components/schedule/RequestLinksButton";

// Heavy, interaction-gated modals — code-split out of the initial bundle so the
// grid paints with far less JS to parse/execute (cuts Total Blocking Time and
// the LCP render delay). Each chunk loads on first open.
const AutoScheduleDialog = dynamic(
  () => import("@/components/schedule/AutoScheduleDialog").then((m) => m.AutoScheduleDialog),
  { ssr: false },
);
const ProposalOverlay = dynamic(
  () => import("@/components/schedule/ProposalOverlay").then((m) => m.ProposalOverlay),
  { ssr: false },
);
const PublishWhatsAppDialog = dynamic(
  () => import("@/components/schedule/PublishWhatsAppDialog").then((m) => m.PublishWhatsAppDialog),
  { ssr: false },
);
const ExportDialog = dynamic(
  () => import("@/components/schedule/ExportDialog").then((m) => m.ExportDialog),
  { ssr: false },
);
const CreateShiftDialog = dynamic(
  () => import("@/components/schedule/CreateShiftDialog").then((m) => m.CreateShiftDialog),
  { ssr: false },
);
const AssignEmployeeSheet = dynamic(
  () => import("@/components/schedule/AssignEmployeeSheet").then((m) => m.AssignEmployeeSheet),
  { ssr: false },
);
const QuickAddShiftSheet = dynamic(
  () => import("@/components/schedule/QuickAddShiftSheet").then((m) => m.QuickAddShiftSheet),
  { ssr: false },
);
const QuickAddEmployeesDialog = dynamic(
  () => import("@/components/schedule/dialogs/QuickAddEmployeesDialog").then((m) => m.QuickAddEmployeesDialog),
  { ssr: false },
);
const WeeklyTemplateDialog = dynamic(
  () => import("@/components/schedule/WeeklyTemplateDialog").then((m) => m.WeeklyTemplateDialog),
  { ssr: false },
);
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
  useWeeklyTemplates,
  useApplyWeeklyTemplate,
  useGenerateFromHours,
  useGenerateFromTemplates,
  useDeleteShift,
  usePublishSchedule,
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
  const [templateOpen, setTemplateOpen] = React.useState(false);
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

  // #1 speed — ONE combined dashboard request replaces the previous five
  // separate queries (schedule / employees / locations / me / metrics). The
  // returned fields keep the SAME query-like shapes ({ data, isLoading,
  // isError, refetch }) the page used before, so the rest of the component is
  // untouched. `metricsEnabled` keeps the metrics block lazy — it is only
  // fetched when the user opens the fairness/metrics view.
  const [metricsEnabled, setMetricsEnabled] = React.useState(false);
  const dashboard = useDashboard(
    `sched_${weekStart.toISODate()}`,
    weekStart.toISODate() ?? undefined,
    { metricsEnabled },
  );
  const scheduleQueryReal = dashboard.schedule;
  const employeesQuery = dashboard.employees;
  const locationsQuery = dashboard.locations;
  // Metrics stay lazy: the hook only fires once `metricsEnabled` flips true.
  const metricsQuery = useEmployeeMetricsLazy(metricsEnabled);
  // Active shift templates — used by #4 to decide whether the week's existing
  // shifts derive from the CURRENT templates (and to surface "no templates").
  const shiftTemplatesQuery = useQuery<ShiftTemplate[]>({
    queryKey: ["shift-templates"],
    queryFn: () => listShiftTemplates(),
    enabled: !isDemo,
    staleTime: 5 * 60_000,
  });
  const autoSchedule = useAutoSchedule();
  const applyProposals = useApplyProposals();
  const publish = usePublishSchedule();
  const copyWeek = useCopyFromPreviousWeek();
  const weeklyTemplates = useWeeklyTemplates();
  const applyTemplate = useApplyWeeklyTemplate();
  const generateFromHoursMut = useGenerateFromHours();
  const generateFromTemplatesMut = useGenerateFromTemplates();
  const deleteShiftMut = useDeleteShift();

  // Current-user data — comes back inside the combined dashboard response so we
  // no longer issue a separate /v1/me request. Same shape as before
  // ({ user.role, memberships, activeOrgId }) so the approval-button logic is
  // untouched.
  const meQ = dashboard.me;
  const role = (meQ.data?.user.role ?? "").toLowerCase();
  const isOwner = role === "owner";
  const isManager = role === "manager";
  const isBranchManager = role === "branch_manager";
  const canApprove = isOwner || isManager;

  // Org name for the top-bar. Demo mode shows the mock label; a logged-in user
  // shows their active organization's real name from /v1/me (never the demo
  // placeholder).
  const orgLabel = isDemo
    ? mockOrg.name
    : meQ.data?.memberships.find((m) => m.orgId === meQ.data?.activeOrgId)
        ?.orgName ??
      meQ.data?.memberships[0]?.orgName ??
      "סידור עבודה";

  const [approving, setApproving] = React.useState(false);
  // Reject flow — a proper RTL dialog replaces the old window.prompt().
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectNote, setRejectNote] = React.useState("");

  // ── DnD state (lifted from ScheduleBoard so EmployeeCard sources live INSIDE DndContext)
  const [activeEmployeeId, setActiveEmployeeId] = React.useState<string | null>(null);
  const [validationByShift, setValidationByShift] = React.useState<
    Record<string, ShiftValidationTone>
  >({});
  const [pendingDrop, setPendingDrop] = React.useState<PendingDrop | null>(null);
  // Hard (blocking) violations — shown in a dialog that explains each law + fix.
  const [blockedViolations, setBlockedViolations] = React.useState<RuleResult[] | null>(null);
  // Shift-first assignment — when set, the AssignEmployeeSheet shows for this shift.
  const [assignShift, setAssignShift] = React.useState<Shift | null>(null);

  // R3 — desktop mouse drags after a 4px move; mobile requires a 300ms hold
  // (≤8px move before that falls through to tap/scroll, never drag) so a single
  // quick tap on a shift still opens AssignEmployeeSheet via onClick.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
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
        // Show a dialog that explains each broken law + how to fix it, instead
        // of a cryptic one-line toast.
        setBlockedViolations(body.violations ?? []);
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

  // A schedule is real (exportable) only when it has a UUID id. The reads route
  // returns an empty shell with a pseudo id ("sched_<date>") for weeks that have
  // no saved schedule — exporting that would render the demo fixture. In demo
  // mode the mock id is intentionally pseudo, so allow it there.
  const isUuid = (v: string | null | undefined): boolean =>
    !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const exportScheduleId =
    isDemo || isUuid(scheduleQuery.data?.id)
      ? scheduleQuery.data?.id ?? null
      : null;

  // Empty week → show ONLY "בנה שבוע אוטומטי". Requests/share/publish are
  // irrelevant until the week actually has shifts, so we hide them to keep the
  // first action obvious and the bar uncluttered.
  const hasShiftsInWeek = (scheduleQuery.data?.shifts?.length ?? 0) > 0;

  // On an empty week the schedule query returns a shell with a pseudo id
  // ("sched_2026-06-07"). Copy / auto-schedule / template all need a REAL
  // schedule row (uuid) or the backend rejects the pseudo id. This creates the
  // row on demand and returns its uuid.
  const ensureRealScheduleId = React.useCallback(async (): Promise<string | null> => {
    const cur = scheduleQuery.data?.id;
    if (cur && isUuid(cur)) return cur;
    const ws = weekStart.toISODate();
    if (!ws) return null;
    try {
      const ensured = await ensureSchedule(ws);
      await scheduleQueryReal.refetch();
      return ensured.id;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleQuery.data?.id, weekStart]);

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
    const note = rejectNote.trim() || undefined;
    setApproving(true);
    try {
      await rejectSchedule(scheduleQuery.data.id, note);
      toast.success("הסידור הוחזר לעריכה");
      setRejectOpen(false);
      setRejectNote("");
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
    // Light haptic tick on mobile when a deliberate hold-drag arms (no-op on
    // desktop / unsupported browsers).
    navigator.vibrate?.(10);
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

  // ── Confirm flows for destructive grid actions ──────────────────────────────
  const [deleteShiftTarget, setDeleteShiftTarget] = React.useState<Shift | null>(null);
  const [unassignTarget, setUnassignTarget] = React.useState<
    { shift: Shift; employeeId: string; name: string } | null
  >(null);

  const requestUnassign = (shift: Shift, employeeId: string) => {
    if (blockIfDemo()) return;
    const name =
      employees.find((e) => e.id === employeeId)?.fullName ?? "העובד/ת";
    setUnassignTarget({ shift, employeeId, name });
  };

  const confirmUnassign = () => {
    if (!unassignTarget) return;
    unassign(unassignTarget.shift, unassignTarget.employeeId);
    setUnassignTarget(null);
  };

  const requestDeleteShift = (shift: Shift) => {
    if (blockIfDemo()) return;
    setDeleteShiftTarget(shift);
  };

  const confirmDeleteShift = async () => {
    if (!deleteShiftTarget) return;
    try {
      await deleteShiftMut.mutateAsync(deleteShiftTarget.id);
      toast.success("המשמרת נמחקה");
    } catch {
      toast.error("מחיקת המשמרת נכשלה");
    } finally {
      setDeleteShiftTarget(null);
    }
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
    // Auto-schedule assigns people to EXISTING shifts — it does not create
    // shifts. With no shifts there is nothing to assign, so tell the user how
    // to lay down a week instead of silently returning nothing.
    if ((scheduleQuery.data.shifts?.length ?? 0) === 0) {
      toast.info('אין משמרות בשבוע זה — לחצו "בנה שבוע" או צרו משמרות תחילה');
      return [];
    }
    const scheduleId = await ensureRealScheduleId();
    if (!scheduleId) {
      toast.error("לא ניתן לטעון את הסידור לשבוע זה");
      return [];
    }
    const res = await autoSchedule.mutateAsync({
      scheduleId,
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
    if ((res.proposals?.length ?? 0) === 0) {
      const assigned = (scheduleQuery.data.shifts ?? []).every(
        (s) => (s.assignments?.length ?? 0) > 0,
      );
      toast.info(
        assigned
          ? "כל המשמרות כבר משובצות 👍"
          : "אין כרגע התאמה אפשרית — בדקו אילוצים/זמינות העובדים",
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

  // Distinguish "no employees in the org at all" from "filters hide everyone".
  // Only count ACTIVE employees as the org population — inactive ones never show.
  const hasAnyActiveEmployees = React.useMemo(
    () => employees.some((e) => e.active),
    [employees],
  );
  const filtersActive =
    locationFilter !== "all" || roleFilter !== "all" || search.trim() !== "";
  const clearFilters = React.useCallback(() => {
    setLocationFilter("all");
    setRoleFilter("all");
    setSearch("");
  }, []);

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

  // Lazy metrics: fairness numbers (weekly hours / fairness score) are only
  // needed once the user actually looks at an employee-centric view — the
  // auto-schedule (fairness weights) dialog, the assign-to-shift sheet, or the
  // mobile employees drawer. Flipping this on once is enough; the query then
  // stays warm for the rest of the session.
  React.useEffect(() => {
    if (metricsEnabled) return;
    if (autoOpen || assignShift !== null || employeesPanelOpen) {
      setMetricsEnabled(true);
    }
  }, [autoOpen, assignShift, employeesPanelOpen, metricsEnabled]);

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
      const scheduleId = await ensureRealScheduleId();
      if (!scheduleId) {
        toast.error("לא ניתן לטעון את הסידור לשבוע זה");
        return;
      }
      const res = await copyWeek.mutateAsync(scheduleId);
      if (res.copied > 0) {
        const withStaff = res.assignmentsCopied
          ? ` כולל ${res.assignmentsCopied} שיבוצי עובדים`
          : "";
        toast.success(`הועתקו ${res.copied} משמרות מהשבוע הקודם${withStaff}`);
      } else {
        toast.info("אין משמרות בשבוע הקודם להעתקה");
      }
    } catch {
      toast.error("העתקת השבוע הקודם נכשלה");
    }
  };

  // Unified "build the week" flow: lay down a base (previous week with its
  // staff, or the single saved weekly template), then open auto-schedule to
  // fill any remaining gaps while honoring the latest employee requests.
  const [buildingWeek, setBuildingWeek] = React.useState(false);
  // #4 rebuild dialog state — shown when the week already has shifts that do
  // NOT derive from the current shift templates.
  const [rebuildOpen, setRebuildOpen] = React.useState(false);

  // Extract the local "HH:mm" wall-clock for a shift in the given timezone.
  // Shift templates store plain local times ("08:00"), so we compare against
  // the shift's local start/end in the template's zone.
  const localHHmm = React.useCallback((iso: string, zone: string): string => {
    const dt = DateTime.fromISO(iso, { zone });
    return dt.isValid ? dt.toFormat("HH:mm") : "";
  }, []);

  // Do the week's existing shifts derive from the CURRENT shift templates?
  // Heuristic (the Shift row carries no templateId today): a shift "matches" a
  // template when its local start+end times line up with a template's
  // start/end. If every shift matches some active template we treat the week as
  // template-derived; otherwise it was hand-built / generated another way and a
  // rebuild would discard the user's work — so we confirm first.
  const shiftsDeriveFromTemplates = React.useCallback((): boolean => {
    const templates = shiftTemplatesQuery.data ?? [];
    const shifts = scheduleQuery.data?.shifts ?? [];
    if (templates.length === 0) return false; // no templates → nothing to derive from
    if (shifts.length === 0) return true; // empty week is handled elsewhere
    const slots = new Set(
      templates.map(
        (t) => `${t.startLocalTime.slice(0, 5)}-${t.endLocalTime.slice(0, 5)}`,
      ),
    );
    return shifts.every((s) => {
      const zone = templates[0]?.timezone || "Asia/Jerusalem";
      const key = `${localHHmm(s.startsAt, zone)}-${localHHmm(s.endsAt, zone)}`;
      return slots.has(key);
    });
  }, [shiftTemplatesQuery.data, scheduleQuery.data, localHHmm]);

  // Shared tail of the flow: auto-assign employees to the (already laid-down)
  // shifts and emit exactly one summary toast. `createdShifts` describes how
  // many shifts the lay-down stage produced (for the no-staff message).
  const fillAndSummarize = async (
    scheduleId: string,
    createdShifts: number,
    toastId: string | number = "build-week",
  ) => {
    toast.loading("משבץ עובדים…", { id: toastId });
    let placed = 0;
    let proposalsCount = 0;
    let unfilled = 0;
    try {
      const auto = await autoSchedule.mutateAsync({ scheduleId, dryRun: true });
      const proposals = auto.proposals ?? [];
      proposalsCount = proposals.length;
      unfilled = auto.unfilled?.length ?? 0;
      if (proposals.length > 0) {
        const res = await applyProposals.mutateAsync({ scheduleId, proposals });
        placed = res?.applied ?? proposals.length;
      }
    } catch (err) {
      // Auto-assignment failed (cold start / timeout / no availability). The
      // shifts (if any) are already created, so degrade to a manual-fill message
      // instead of failing the entire build.
      // eslint-disable-next-line no-console
      console.warn("auto-schedule failed; shifts remain for manual fill", err);
      await scheduleQueryReal.refetch();
      if (createdShifts > 0) {
        toast.info(
          `נוצרו ${createdShifts} משמרות. השיבוץ האוטומטי לא זמין כרגע — אפשר לשבץ ידנית.`,
          { id: toastId },
        );
      } else {
        toast.error("השיבוץ האוטומטי לא זמין כרגע. נסו שוב בעוד רגע.", { id: toastId });
      }
      return;
    }
    await scheduleQueryReal.refetch();

    if (placed > 0) {
      // Surface partial fills instead of a blanket success: some proposals can
      // fail to apply (timeout/concurrency) or some shifts stay unfilled (no
      // eligible employee) — the manager must know to complete them manually.
      const partial = (proposalsCount > 0 && placed < proposalsCount) || unfilled > 0;
      if (partial) {
        toast.warning(
          `שובצו ${placed} משמרות. ${unfilled > 0 ? `${unfilled} משמרות נותרו ללא שיבוץ — ` : ""}השלימו ידנית את השאר.`,
          { id: toastId },
        );
      } else {
        toast.success(`השבוע נבנה ושובצו ${placed} משמרות 🎉`, { id: toastId });
      }
    } else if (createdShifts > 0) {
      toast.info(
        `נוצרו ${createdShifts} משמרות. אין כרגע עובדים זמינים לשיבוץ אוטומטי.`,
        { id: toastId },
      );
    } else {
      toast.info("אין כרגע עובדים זמינים לשיבוץ אוטומטי.", { id: toastId });
    }
  };

  // Empty-week lay-down ladder: templates → weekly template → operating hours →
  // copy previous week. Returns the created-shift count, or -1 when nothing
  // could be laid down (caller shows guidance). Surfaces the "no templates"
  // settings nudge when the org has none defined.
  const layDownEmptyWeek = async (
    scheduleId: string,
    toastId: string | number = "build-week",
    templatesOverride?: NonNullable<typeof weeklyTemplates.data>,
  ): Promise<number> => {
    toast.loading("יוצר משמרות…", { id: toastId });
    // 1) The canonical "schedule rules" weekly template is now the primary source
    // of truth (set up in onboarding / settings → "כללי סידור"). Applying it both
    // creates the week's shifts AND pre-assigns the fixed people.
    // Use the freshly-refetched list passed by the caller when available — reading
    // `weeklyTemplates.data` here can be a STALE closure (an empty list cached
    // before onboarding saved the template), which silently skips apply-template
    // and wrongly falls through to the operating-hours split.
    const weeklyTpls = (templatesOverride ?? weeklyTemplates.data ?? []).filter(
      (t) => t.shifts.length > 0,
    );
    const canonical =
      weeklyTpls.find((t) => t.name === DEFAULT_TEMPLATE_NAME) ?? weeklyTpls[0];

    // Each strategy is attempted INDEPENDENTLY: a failure in one degrades to the
    // next instead of aborting the whole build. This is what prevents a single
    // throwing call (e.g. apply-template 404/5xx) from surfacing the generic
    // "בניית השבוע נכשלה" toast.
    if (canonical) {
      try {
        const res = await applyTemplate.mutateAsync({ scheduleId, templateId: canonical.id });
        if (res.shiftsCreated > 0) return res.shiftsCreated;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("apply-template failed; falling back", err);
      }
    }
    // 2) Legacy shift templates, if the org still uses them. Default templatesFound
    // to 1 (assume present) so a thrown error never wrongly triggers the nudge.
    let templatesFound = 1;
    try {
      const genT = await generateFromTemplatesMut.mutateAsync(scheduleId);
      templatesFound = genT.templatesFound;
      if (genT.shiftsCreated > 0) return genT.shiftsCreated;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("generate-from-templates failed; falling back", err);
    }
    // 3) Otherwise split the business operating hours (zero setup).
    try {
      const gen = await generateFromHoursMut.mutateAsync(scheduleId);
      if (gen.shiftsCreated > 0) return gen.shiftsCreated;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("generate-from-hours failed; falling back", err);
    }
    // 4) Otherwise carry over last week (shifts + same employees).
    try {
      const copied = await copyWeek.mutateAsync(scheduleId);
      if (copied.copied > 0) return copied.copied;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("copy-week failed", err);
    }
    // Nothing could be laid down AND no rules/templates exist → nudge the user to
    // define their schedule rules (the friendly path), not the raw templates page.
    if (!canonical && templatesFound === 0) {
      toast.error("לא הוגדרו עדיין כללי סידור", {
        id: "build-week-templates-nudge",
        action: {
          label: "הגדר כללים",
          onClick: () => {
            window.location.href = "/settings?tab=rules";
          },
        },
      });
    }
    return -1;
  };

  // Regenerate the week from current templates (replacing the auto-generated
  // shifts), then auto-fill. Called when the user confirms the rebuild dialog.
  const rebuildFromTemplates = async () => {
    if (!scheduleQuery.data) return;
    if (blockIfDemo()) return;
    setRebuildOpen(false);
    const toastId = "build-week";
    setBuildingWeek(true);
    toast.loading("בונה מחדש מהתבניות…", { id: toastId });
    try {
      const scheduleId = await ensureRealScheduleId();
      if (!scheduleId) {
        toast.error("לא ניתן ליצור סידור לשבוע זה", { id: toastId });
        return;
      }
      toast.loading("יוצר משמרות מהתבניות…", { id: toastId });
      const genT = await generateFromTemplates(scheduleId, { replace: true });
      if (genT.templatesFound === 0) {
        toast.error("לא הוגדרו תבניות משמרת", {
          id: toastId,
          action: {
            label: "פתח הגדרות",
            onClick: () => {
              window.location.href = "/settings/shift-templates";
            },
          },
        });
        return;
      }
      if (genT.shiftsCreated > 0) {
        toast.loading(`נוצרו ${genT.shiftsCreated} משמרות…`, { id: toastId });
      }
      await fillAndSummarize(scheduleId, genT.shiftsCreated, toastId);
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : null;
      toast.error(msg ? `בניית השבוע נכשלה — ${msg}` : "בניית השבוע נכשלה", {
        id: toastId,
      });
    } finally {
      setBuildingWeek(false);
    }
  };

  const buildWeek = async () => {
    if (!scheduleQuery.data) return;
    if (blockIfDemo()) return;
    const hasShifts = (scheduleQuery.data.shifts?.length ?? 0) > 0;

    // #4 — non-empty week whose shifts do NOT derive from the current templates:
    // rebuilding would replace the auto-generated shifts, so confirm first.
    if (hasShifts && !shiftsDeriveFromTemplates()) {
      setRebuildOpen(true);
      return;
    }

    const toastId = "build-week";
    setBuildingWeek(true);
    toast.loading("מכין את השבוע…", { id: toastId });
    try {
      // Independent prep runs in parallel: creating the real schedule row and
      // ALWAYS refetching the weekly-templates list. We must use the refetch
      // result directly (not weeklyTemplates.data) — the hook's state isn't
      // updated until a re-render, so reading it mid-build is a stale closure
      // that silently skips the canonical template.
      const [scheduleId, tplRes] = await Promise.all([
        ensureRealScheduleId(),
        weeklyTemplates.refetch(),
      ]);
      if (!scheduleId) {
        toast.error("לא ניתן ליצור סידור לשבוע זה", { id: toastId });
        return;
      }
      let createdShifts = 0;
      if (!hasShifts) {
        const laid = await layDownEmptyWeek(scheduleId, toastId, tplRes.data ?? undefined);
        if (laid < 0) {
          toast.info(
            "כדי לבנות שבוע אוטומטית, הגדירו שעות פעילות בהגדרות העסק (או צרו משמרות / תבנית).",
            { id: toastId },
          );
          return;
        }
        createdShifts = laid;
        if (createdShifts > 0) {
          toast.loading(`נוצרו ${createdShifts} משמרות…`, { id: toastId });
        }
      }
      await fillAndSummarize(scheduleId, createdShifts, toastId);
    } catch (err) {
      // Surface the real error to aid diagnosis instead of a generic message.
      const msg = err instanceof Error && err.message ? err.message : null;
      toast.error(msg ? `בניית השבוע נכשלה — ${msg}` : "בניית השבוע נכשלה", {
        id: toastId,
      });
    } finally {
      setBuildingWeek(false);
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100dvh-3.5rem)]">
      <h1 className="sr-only">סידור עבודה</h1>
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-3 border-b bg-card px-3 sm:px-4 py-2 flex-wrap">
        <div className="font-semibold truncate max-w-[140px] sm:max-w-none">{orgLabel}</div>
        <WeekSelector weekStart={weekStart} onChange={setWeekStart} />
        {/* View mode toggle — weekly / daily */}
        <div className="flex rounded-md border overflow-hidden text-sm h-9 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("weekly")}
            aria-pressed={viewMode === "weekly"}
            className={`px-3 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
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
            aria-pressed={viewMode === "daily"}
            className={`px-3 py-1 border-s transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
              viewMode === "daily"
                ? "bg-indigo-500 text-white font-medium"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            יומי
          </button>
        </div>
        {/* #2 confirmations — compact pill in the toolbar for the published
           state (replaces the old floating mid-page card). Self-hides until the
           schedule is published with a real id. */}
        {scheduleQuery.data?.status === "published" && scheduleQuery.data.id && (
          <ConfirmationPill scheduleId={scheduleQuery.data.id} isPublished />
        )}
        <div className="me-auto" />
        {/* Mobile-only: filter + employees drawer triggers */}
        {/* Mobile secondary triggers — icon-only on the narrowest phones
            (<400px) to cut crowding; the label returns once there is room. */}
        <Button
          variant="outline"
          size="sm"
          className="sm:hidden h-11"
          onClick={() => setFiltersOpen(true)}
          aria-label="סינון"
        >
          <Filter className="h-4 w-4" />
          <span className="hidden min-[400px]:inline">סינון</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="sm:hidden h-11"
          onClick={() => setEmployeesPanelOpen(true)}
          aria-label="עובדים"
        >
          <UsersIcon className="h-4 w-4" />
          <span className="hidden min-[400px]:inline">עובדים</span>
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
        {/* Requests inbox + share-request-links are always available so a
            manager can collect employee availability BEFORE building the week.
            They no longer wait for the week to have shifts. */}
        <RequestsInboxButton />
        <RequestLinksButton />
        <Button
          variant="glow"
          size="sm"
          onClick={buildWeek}
          disabled={!scheduleQuery.data || buildingWeek}
          className={`h-11 sm:h-10 ${!hasShiftsInWeek ? "flex-1 sm:flex-none" : ""}`}
          aria-label="בנה שבוע אוטומטי"
          aria-busy={buildingWeek}
          title="לחיצה אחת: יוצר את משמרות השבוע משעות הפעילות ומשבץ את העובדים אוטומטית, לפי הבקשות"
        >
          <Wand2 className="h-4 w-4" />
          {/* On an empty week the label is the single primary CTA — always show
             it (full-width labeled button on mobile). With shifts it collapses
             to an icon on small screens to keep the bar tidy. */}
          <span className={hasShiftsInWeek ? "hidden sm:inline" : "inline"}>
            {buildingWeek ? "בונה…" : "בנה שבוע אוטומטי"}
          </span>
        </Button>
        {hasShiftsInWeek && (
          <>
        {/* Secondary actions — grouped under one "עוד" menu to keep the bar clean. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-11 sm:h-10"
              aria-label="עוד פעולות"
              disabled={!scheduleQuery.data || buildingWeek}
            >
              <ChevronDown className="h-4 w-4" />
              <span className="hidden sm:inline">עוד</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>בנייה ועריכה</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                if (blockIfDemo()) return;
                setAutoOpen(true);
              }}
            >
              <Sparkles className="h-4 w-4" />
              שיבוץ אוטומטי
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTemplateOpen(true)}>
              <CalendarCog className="h-4 w-4" />
              תבנית שבועית קבועה
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.location.href = "/settings?tab=rules";
              }}
            >
              <CalendarCog className="h-4 w-4" />
              ערוך כללי סידור
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={copyFromPreviousWeek}
              disabled={copyWeek.isPending}
            >
              <Copy className="h-4 w-4" />
              {copyWeek.isPending ? "מעתיק…" : "העתק שבוע קודם"}
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>שיתוף</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setExportOpen(true)} disabled={!exportScheduleId}>
              <Printer className="h-4 w-4" />
              ייצוא לתמונה / PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (blockIfDemo()) return;
                setPublishOpen(true);
              }}
            >
              <MessageCircle className="h-4 w-4" />
              שליחה ב-WhatsApp
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Approval workflow buttons — replace publish for branch managers, add review actions for owners. */}
        {isBranchManager && scheduleStatus === "draft" ? (
          <Button
            onClick={submitForApproval}
            disabled={approving || !scheduleQuery.data || buildingWeek}
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
              onClick={() => setRejectOpen(true)}
              disabled={approving || buildingWeek}
              className="h-11 sm:h-10"
              title="החזר את הסידור לעריכה למנהל הסניף"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">החזר לעריכה</span>
            </Button>
            <Button
              variant="glow"
              onClick={approve}
              disabled={approving || buildingWeek}
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
            disabled={publish.isPending || !scheduleQuery.data || buildingWeek}
            className="h-11 sm:h-10"
            title="שמירה כסידור פורסם + פתיחת חלון שיתוף"
          >
            <Upload className="h-4 w-4" />
            {publish.isPending ? "מפרסם…" : "פרסם ושתף"}
          </Button>
        )}
          </>
        )}
      </div>

      {/* Labor cost bar — hidden for small-business simplicity */}
      {/* <LaborCostBar weekStart={weekStart} /> */}

      {/* Compliance banner — hidden for small-business simplicity */}
      {/* <ComplianceBanner scheduleId={scheduleQuery.data?.id ?? null} /> */}

      {/* Confirmation status moved: compact pill lives in the top toolbar, and
         the full card is anchored inside the right employees sidebar below. */}

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
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive space-y-3">
              <p>שגיאה בטעינת הסידור</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void scheduleQueryReal.refetch()}
              >
                נסה שוב
              </Button>
            </div>
          ) : scheduleQuery.data ? (
            scheduleQuery.data.shifts.length === 0 ? (
              <EmptyScheduleState
                onBuildWeek={buildWeek}
                buildingWeek={buildingWeek}
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
                onUnassign={requestUnassign}
                onRequestAssign={handleRequestAssign}
                onDeleteShift={requestDeleteShift}
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
                onUnassign={requestUnassign}
                onRequestAssign={handleRequestAssign}
              />
            )
          ) : null}
        </section>

        {/* Right rail — employees (desktop only) */}
        <aside aria-label="עובדים זמינים" className="hidden sm:block w-72 shrink-0 border-s bg-muted/30 p-3 overflow-y-auto">
          {/* #2 — full confirmations card, anchored here as a w-full block when
             the schedule is published (instead of floating mid-page). */}
          {scheduleQuery.data?.status === "published" && scheduleQuery.data.id && (
            <div className="mb-3 w-full">
              <ConfirmationStatus
                scheduleId={scheduleQuery.data.id}
                isPublished
                weekLabel={weekStart.toISODate() ?? ""}
              />
            </div>
          )}
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
                <div className="p-3 text-center space-y-2">
                  {hasAnyActiveEmployees && filtersActive ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        אין עובדים תואמים לסינון
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearFilters}
                      >
                        נקה סינון
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      אין עובדים פעילים — הוסיפו עובדים בהגדרות
                    </p>
                  )}
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

        <ConfirmWarningsDialog
          open={blockedViolations !== null}
          warnings={blockedViolations ?? []}
          variant="blocking"
          onConfirm={() => setBlockedViolations(null)}
          onCancel={() => setBlockedViolations(null)}
        />

        <ConfirmDialog
          open={deleteShiftTarget !== null}
          onOpenChange={(o) => { if (!o) setDeleteShiftTarget(null); }}
          title="למחוק את המשמרת?"
          description="פעולה זו תמחק את המשמרת וכל השיבוצים בה. לא ניתן לבטל."
          confirmLabel="מחק משמרת"
          destructive
          pending={deleteShiftMut.isPending}
          onConfirm={() => void confirmDeleteShift()}
        />

        <ConfirmDialog
          open={unassignTarget !== null}
          onOpenChange={(o) => { if (!o) setUnassignTarget(null); }}
          title="להסיר מהמשמרת?"
          description={
            unassignTarget
              ? `${unassignTarget.name} יוסר/תוסר מהמשמרת. המשמרת תישאר.`
              : undefined
          }
          confirmLabel="הסר"
          destructive
          pending={assign.isPending}
          onConfirm={confirmUnassign}
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
          <p className="text-[11px] text-muted-foreground mb-2">
            הקש על משמרת לשיבוץ · החזק וגרור עובד/ת להזזה
          </p>
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
                <div className="p-3 text-center space-y-2">
                  {hasAnyActiveEmployees && filtersActive ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        אין עובדים תואמים לסינון
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearFilters}
                      >
                        נקה סינון
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      אין עובדים פעילים — הוסיפו עובדים בהגדרות
                    </p>
                  )}
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
        employees={employees}
        shifts={scheduleQuery.data?.shifts ?? []}
        loading={autoSchedule.isPending}
      />
      {/* Mounted only when opened so its internal data hooks (employees +
          weekly-templates) stay off the first-paint critical path. */}
      {templateOpen && (
        <WeeklyTemplateDialog
          open
          onOpenChange={setTemplateOpen}
          scheduleId={exportScheduleId}
        />
      )}
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
        scheduleId={exportScheduleId}
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

      {/* #4 — rebuild-from-templates confirmation. Shown when the current week
         already has shifts that don't derive from the active templates, so the
         user understands the auto-generated shifts will be replaced. */}
      <Dialog open={rebuildOpen} onOpenChange={setRebuildOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>בנה מחדש לפי התבניות?</DialogTitle>
            <DialogDescription>
              {(shiftTemplatesQuery.data?.length ?? 0) === 0
                ? "לא הוגדרו תבניות משמרת. הגדירו תבניות בהגדרות העסק ואז נסו שוב."
                : "בשבוע זה כבר קיימות משמרות שלא נוצרו מהתבניות הנוכחיות. בנייה מחדש תחליף את המשמרות שנוצרו אוטומטית בתבניות המשמרת המעודכנות, ולאחר מכן תשבץ עובדים מחדש."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRebuildOpen(false)}
              disabled={buildingWeek}
            >
              ביטול
            </Button>
            {(shiftTemplatesQuery.data?.length ?? 0) === 0 ? (
              <Button asChild variant="glow">
                <Link href="/settings/shift-templates">
                  <CalendarCog className="h-4 w-4" />
                  פתח הגדרות תבניות
                </Link>
              </Button>
            ) : (
              <Button
                variant="glow"
                onClick={() => void rebuildFromTemplates()}
                disabled={buildingWeek}
              >
                <Wand2 className="h-4 w-4" />
                {buildingWeek ? "בונה…" : "בנה מחדש"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject (return-to-edit) dialog — replaces window.prompt with a proper
         RTL dialog containing a labeled, optional note for the branch manager. */}
      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setRejectNote("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>החזרת הסידור לעריכה</DialogTitle>
            <DialogDescription>
              ניתן לצרף הערה למנהל הסניף שתסביר מה נדרש לתקן (אופציונלי).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 text-start">
            <label htmlFor="reject-note" className="text-sm font-medium">
              הערה למנהל הסניף
            </label>
            <textarea
              id="reject-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={4}
              placeholder="לדוגמה: חסר עובד במשמרת הערב של יום חמישי…"
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={approving}
            >
              ביטול
            </Button>
            <Button onClick={reject} disabled={approving}>
              {approving ? "מחזיר…" : "החזר לעריכה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
