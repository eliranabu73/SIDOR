"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import {
  applyProposals,
  clockIn,
  clockOut,
  createEmployee,
  createLocation,
  createRole,
  deleteEmployee,
  deleteShift,
  fetchEmployees,
  fetchEmployeesSummary,
  fetchFairness,
  fetchLocations,
  fetchRoles,
  fetchSchedule,
  fetchDashboard,
  fetchMe,
  fetchTimeEntries,
  fetchTimetrackingLive,
  fetchTimetrackingStatus,
  copyFromPreviousWeek,
  patchAssignment,
  publishSchedule,
  runAutoSchedule,
  fetchWeeklyTemplates,
  createWeeklyTemplate,
  updateWeeklyTemplate,
  deleteWeeklyTemplate,
  applyWeeklyTemplate,
  generateFromHours,
  generateFromTemplates,
  fetchRequestsSummary,
  fetchRequestLinks,
  type CopyFromPreviousWeekResult,
  type WeeklyTemplate,
  type WeeklyTemplateInput,
  type ApplyTemplateResult,
  type GenerateFromHoursResult,
  type GenerateFromTemplatesResult,
  type DashboardData,
  type MeResponse,
  type RequestsSummary,
  type RequestLinksBundle,
  updateEmployee,
  validateAssignment,
  type CreateEmployeeBody,
  type CreateLocationBody,
  type CreateRoleBody,
  type EmployeeSummary,
  type LocationItem,
  type RoleItem,
  type TimeEntry,
  type TimetrackingLiveResponse,
  type TimetrackingStatusResponse,
  type UpdateEmployeeBody,
} from "./api";
import { buildMockSchedule, mockEmployees, mockMetrics } from "./mocks";
import type {
  AssignBody,
  AssignSuccess,
  AssignmentProposal,
  AutoScheduleResponse,
  AutoScheduleWeights,
  Employee,
  EmployeeScheduleMetrics,
  ID,
  Schedule,
  ValidateAssignmentResponse,
} from "./types";

// Must be explicitly "true" to show mocks. Absence of the var = real data.
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

export const queryKeys = {
  schedule: (id: ID, weekStart?: string) =>
    ["schedule", id, weekStart] as const,
  employees: () => ["employees"] as const,
  employeesSummary: () => ["employees-summary"] as const,
  metrics: () => ["metrics"] as const,
  locations: () => ["locations"] as const,
  roles: () => ["roles"] as const,
  me: () => ["me"] as const,
  dashboard: (id: ID, weekStart?: string) =>
    ["dashboard", id, weekStart] as const,
};

export function useSchedule(scheduleId: ID, weekStart?: string) {
  return useQuery<Schedule>({
    queryKey: queryKeys.schedule(scheduleId, weekStart),
    queryFn: async () => {
      if (USE_MOCKS) return buildMockSchedule();
      return fetchSchedule(scheduleId, weekStart);
    },
    staleTime: 5 * 60_000,
  });
}

export function useEmployees() {
  return useQuery<Employee[]>({
    queryKey: queryKeys.employees(),
    queryFn: () => fetchEmployees(),
    staleTime: 10 * 60_000,
  });
}

/** Fetches employees with pre-aggregated constraint counts (1 request vs N+1). */
export function useEmployeesSummary() {
  return useQuery<EmployeeSummary[]>({
    queryKey: queryKeys.employeesSummary(),
    queryFn: () => fetchEmployeesSummary(),
    staleTime: 60_000,
  });
}

export function useLocations() {
  return useQuery<LocationItem[]>({
    queryKey: queryKeys.locations(),
    queryFn: () => fetchLocations(),
    staleTime: 10 * 60_000,
  });
}

export function useRoles() {
  return useQuery<RoleItem[]>({
    queryKey: queryKeys.roles(),
    queryFn: () => fetchRoles(),
    staleTime: 5 * 60_000,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation<Employee, Error, CreateEmployeeBody>({
    mutationFn: (body) => createEmployee(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.employees() });
      qc.invalidateQueries({ queryKey: queryKeys.employeesSummary() });
    },
    onError: (err) => {
      console.error("useCreateEmployee failed", err);
    },
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation<Employee, Error, { id: ID; body: UpdateEmployeeBody }>({
    mutationFn: ({ id, body }) => updateEmployee(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.employees() });
      qc.invalidateQueries({ queryKey: queryKeys.employeesSummary() });
    },
    onError: (err) => {
      console.error("useUpdateEmployee failed", err);
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation<Employee, Error, ID>({
    mutationFn: (id) => deleteEmployee(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.employees() });
      qc.invalidateQueries({ queryKey: queryKeys.employeesSummary() });
    },
    onError: (err) => {
      console.error("useDeleteEmployee failed", err);
    },
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation<LocationItem, Error, CreateLocationBody>({
    mutationFn: (body) => createLocation(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.locations() });
    },
    onError: (err) => {
      console.error("useCreateLocation failed", err);
    },
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation<RoleItem, Error, CreateRoleBody>({
    mutationFn: (body) => createRole(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.roles() });
    },
    onError: (err) => {
      console.error("useCreateRole failed", err);
    },
  });
}

/** Shared fairness→metrics transform used by the eager + lazy metrics hooks. */
async function loadEmployeeMetrics(): Promise<EmployeeScheduleMetrics[]> {
  if (USE_MOCKS) return mockMetrics;
  // Use 1-week fairness window and transform to EmployeeScheduleMetrics shape.
  const data = await fetchFairness(1);
  return data.employees.map((e) => ({
    employeeId: e.employeeId,
    weeklyAssignedMinutes: Math.round(e.hours * 60),
    weeklyTargetMinutes: 42 * 60, // IL standard week
    fairnessScore: e.score,
  })) as unknown as EmployeeScheduleMetrics[];
}

export function useEmployeeMetrics() {
  return useQuery<EmployeeScheduleMetrics[]>({
    queryKey: queryKeys.metrics(),
    queryFn: loadEmployeeMetrics,
    staleTime: 60_000,
  });
}

/**
 * Lazy variant of the metrics query: gated behind an `enabled` flag so it never
 * blocks the schedule page's first paint. Flip `enabled` to true once the grid
 * is mounted (or when the user opens a metrics-dependent view). Identical data
 * shape to {@link useEmployeeMetrics}; longer staleTime since metrics are a
 * secondary, slow-changing signal.
 */
export function useEmployeeMetricsLazy(enabled: boolean) {
  return useQuery<EmployeeScheduleMetrics[]>({
    queryKey: queryKeys.metrics(),
    queryFn: loadEmployeeMetrics,
    enabled,
    staleTime: 15 * 60_000,
  });
}

/**
 * Single-request replacement for the schedule page's 5 separate hooks
 * (schedule, employees, locations, me, metrics). Fetches GET /v1/dashboard once
 * and exposes per-slice query-result objects shaped IDENTICALLY to the
 * dedicated hooks, so page.tsx swaps `xQuery` → `dashboard.x` with near-zero
 * churn (`.data`, `.isLoading`, `.error`, `.refetch` all keep working).
 *
 * `metrics` is intentionally LAZY — it is NOT part of the dashboard payload and
 * does not block first paint. It runs only once `metricsEnabled` is true.
 *
 * In USE_MOCKS mode this composes the same mock builders the individual hooks
 * use, so the demo path is unchanged.
 */
export function useDashboard(
  scheduleId: ID,
  weekStartISO: string | null | undefined,
  options?: { metricsEnabled?: boolean },
) {
  // Normalize to a stable string for the query key + request. An empty week is
  // never queried (enabled guard below) so the placeholder is never sent.
  const weekStart = weekStartISO ?? "";
  const dashboardQuery = useQuery<DashboardData>({
    queryKey: queryKeys.dashboard(scheduleId, weekStart),
    enabled: !!weekStartISO,
    queryFn: async () => {
      if (USE_MOCKS) {
        const schedule = buildMockSchedule();
        return {
          schedule,
          shifts: schedule.shifts,
          employees: mockEmployees as unknown as Employee[],
          locations: [] as LocationItem[],
          me: {
            user: { id: "mock", role: "owner" },
            memberships: [],
            activeOrgId: null,
          } as MeResponse,
        };
      }
      return fetchDashboard(scheduleId, weekStart);
    },
    staleTime: 5 * 60_000,
  });

  // `me` is already part of the /v1/dashboard payload, so we do NOT fire a
  // second /v1/me on mount. This query only runs as a fallback if the dashboard
  // request errors (so org-name/role resolution still recovers). Eliminates one
  // cold serverless round-trip on every schedule-page load.
  const meQuery = useQuery<MeResponse>({
    queryKey: queryKeys.me(),
    queryFn: fetchMe,
    enabled: !USE_MOCKS && dashboardQuery.isError,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const metricsQuery = useEmployeeMetricsLazy(options?.metricsEnabled ?? false);

  const d = dashboardQuery.data;

  return {
    /** Full one-shot payload (includes shifts) for callers that want it raw. */
    dashboard: dashboardQuery,
    schedule: {
      data: d?.schedule,
      isLoading: dashboardQuery.isLoading,
      isError: dashboardQuery.isError,
      error: dashboardQuery.error,
      refetch: dashboardQuery.refetch,
    },
    employees: {
      data: d?.employees,
      isLoading: dashboardQuery.isLoading,
      isError: dashboardQuery.isError,
      error: dashboardQuery.error,
      refetch: dashboardQuery.refetch,
    },
    locations: {
      data: d?.locations,
      isLoading: dashboardQuery.isLoading,
      isError: dashboardQuery.isError,
      error: dashboardQuery.error,
      refetch: dashboardQuery.refetch,
    },
    // `me` comes from the dashboard payload when present, otherwise from the
    // dedicated /v1/me query (kept cached under the same ["me"] key the page
    // already uses) so org-name resolution never regresses.
    me: {
      data: d?.me ?? meQuery.data,
      isLoading: meQuery.isLoading && !d?.me,
      isError: meQuery.isError,
      error: meQuery.error,
      refetch: meQuery.refetch,
    },
    metrics: metricsQuery,
  };
}

export function useValidateAssignment() {
  return useMutation<
    ValidateAssignmentResponse,
    Error,
    { shiftId: ID; employeeId: ID; action: "assign" | "unassign" | "replace" }
  >({
    mutationFn: async ({ shiftId, employeeId, action }) => {
      if (USE_MOCKS) {
        // Naive mock: return ok unless the employee id ends with 5
        return {
          ok: true,
          violations: [],
          warnings: employeeId.endsWith("5")
            ? [
                {
                  code: "OVERTIME",
                  severity: "warning" as const,
                  message: "העובד/ת חורג/ת ממגבלת השעות השבועית",
                },
              ]
            : [],
          expectedShiftVersion: 1,
        };
      }
      return validateAssignment(shiftId, { employeeId, action });
    },
  });
}

interface AssignVars {
  shiftId: ID;
  body: AssignBody;
}

export function useAssignMutation(
  options?: UseMutationOptions<AssignSuccess, Error, AssignVars>,
) {
  const qc = useQueryClient();
  return useMutation<AssignSuccess, Error, AssignVars>({
    mutationFn: async ({ shiftId, body }) => {
      if (USE_MOCKS) {
        // In mocks we just optimistically modify the cache; return a fake shift
        return {
          shift: {
            id: shiftId,
            scheduleId: "mock",
            locationId: "loc_1",
            role: "מלצרית",
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
            requiredCount: 1,
            version: body.expectedShiftVersion + 1,
            assignments:
              body.action === "unassign"
                ? []
                : [
                    {
                      id: "mock_a",
                      shiftId,
                      employeeId: body.employeeId,
                      status: "assigned" as const,
                      createdAt: new Date().toISOString(),
                    },
                  ],
          },
          warnings: [],
        };
      }
      return patchAssignment(shiftId, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    ...options,
  });
}

export function useAutoSchedule() {
  return useMutation<
    AutoScheduleResponse,
    Error,
    {
      scheduleId: ID;
      provider?: "greedy" | "or-tools";
      dryRun?: boolean;
      weights?: Partial<AutoScheduleWeights>;
    }
  >({
    mutationFn: async (vars) => {
      if (USE_MOCKS) {
        return {
          proposals: [
            {
              shiftId: "shift_0_0",
              employeeId: mockEmployees[0]!.id,
              score: 0.92,
              reasoning: "תאימות גבוהה ל-תפקיד וזמינות שבועית",
            },
            {
              shiftId: "shift_1_1",
              employeeId: mockEmployees[1]!.id,
              score: 0.81,
              reasoning: "ממשיך משמרת קודמת",
            },
          ],
          unfilled: [],
        };
      }
      return runAutoSchedule(vars.scheduleId, {
        provider: vars.provider,
        dryRun: vars.dryRun,
        weights: vars.weights,
      });
    },
  });
}

export function useApplyProposals() {
  const qc = useQueryClient();
  return useMutation<
    { applied: number },
    Error,
    { scheduleId: ID; proposals: AssignmentProposal[] }
  >({
    mutationFn: async ({ scheduleId, proposals }) => {
      if (USE_MOCKS) return { applied: proposals.length };
      return applyProposals(scheduleId, proposals);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule"] }),
  });
}

export function useDeleteShift() {
  const qc = useQueryClient();
  return useMutation<void, Error, ID>({
    mutationFn: async (shiftId) => {
      if (USE_MOCKS) return;
      return deleteShift(shiftId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}

export function usePublishSchedule() {
  const qc = useQueryClient();
  return useMutation<Schedule, Error, ID>({
    mutationFn: async (scheduleId) => {
      if (USE_MOCKS) {
        const s = buildMockSchedule();
        return { ...s, status: "published" };
      }
      return publishSchedule(scheduleId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule"] }),
  });
}

export function useCopyFromPreviousWeek() {
  const qc = useQueryClient();
  return useMutation<CopyFromPreviousWeekResult, Error, ID>({
    mutationFn: async (scheduleId) => copyFromPreviousWeek(scheduleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}

// --------- Weekly templates + requests inbox (WS3/WS4) ---------

/**
 * Weekly templates are only needed when the user builds a week or opens the
 * template dialog — NOT on first paint. Defaults to disabled so the schedule
 * page no longer fires /v1/weekly-templates (a cold serverless call) on every
 * load; callers `.refetch()` it on demand (build flow) or pass `enabled` when a
 * dialog mounts. `retry: 1` caps the retry storm if the endpoint is briefly 5xx.
 */
export function useWeeklyTemplates(enabled = false) {
  return useQuery<WeeklyTemplate[]>({
    queryKey: ["weekly-templates"],
    queryFn: fetchWeeklyTemplates,
    enabled: enabled && !USE_MOCKS,
    retry: 1,
    staleTime: 5 * 60_000,
  });
}

export function useCreateWeeklyTemplate() {
  const qc = useQueryClient();
  return useMutation<WeeklyTemplate, Error, WeeklyTemplateInput>({
    mutationFn: (body) => createWeeklyTemplate(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly-templates"] }),
  });
}

export function useUpdateWeeklyTemplate() {
  const qc = useQueryClient();
  return useMutation<WeeklyTemplate, Error, { id: ID; body: WeeklyTemplateInput }>({
    mutationFn: ({ id, body }) => updateWeeklyTemplate(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly-templates"] }),
  });
}

export function useDeleteWeeklyTemplate() {
  const qc = useQueryClient();
  return useMutation<void, Error, ID>({
    mutationFn: (id) => deleteWeeklyTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly-templates"] }),
  });
}

export function useApplyWeeklyTemplate() {
  const qc = useQueryClient();
  return useMutation<ApplyTemplateResult, Error, { scheduleId: ID; templateId: ID }>({
    mutationFn: ({ scheduleId, templateId }) => applyWeeklyTemplate(scheduleId, templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}

export function useGenerateFromHours() {
  const qc = useQueryClient();
  return useMutation<GenerateFromHoursResult, Error, ID>({
    mutationFn: (scheduleId) => generateFromHours(scheduleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}

export function useGenerateFromTemplates() {
  const qc = useQueryClient();
  return useMutation<
    GenerateFromTemplatesResult,
    Error,
    ID | { scheduleId: ID; replace?: boolean }
  >({
    mutationFn: (vars) => {
      const scheduleId = typeof vars === "string" ? vars : vars.scheduleId;
      const replace = typeof vars === "string" ? false : vars.replace ?? false;
      return generateFromTemplates(scheduleId, { replace });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRequestsSummary() {
  return useQuery<RequestsSummary>({
    queryKey: ["requests", "summary"],
    queryFn: fetchRequestsSummary,
    enabled: !USE_MOCKS,
    refetchInterval: 60_000,
    retry: 1,
    staleTime: 30_000,
  });
}

export function useRequestLinks(enabled: boolean) {
  return useQuery<RequestLinksBundle>({
    queryKey: ["requests", "links"],
    queryFn: fetchRequestLinks,
    enabled: enabled && !USE_MOCKS,
  });
}

// --------- Time Tracking hooks ---------

export function useTimetrackingStatus() {
  return useQuery<TimetrackingStatusResponse>({
    queryKey: ["timetracking", "status"],
    queryFn: fetchTimetrackingStatus,
    refetchInterval: 30_000,
  });
}

export function useTimetrackingLive() {
  return useQuery<TimetrackingLiveResponse>({
    queryKey: ["timetracking", "live"],
    queryFn: fetchTimetrackingLive,
    refetchInterval: 30_000,
  });
}

export function useTimeEntries(from: string, to: string) {
  return useQuery<TimeEntry[]>({
    queryKey: ["timetracking", "entries", from, to],
    queryFn: () => fetchTimeEntries(from, to),
  });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clockIn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timetracking"] }),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clockOut,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timetracking"] }),
  });
}
