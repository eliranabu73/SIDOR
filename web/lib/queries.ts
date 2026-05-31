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
  fetchTimeEntries,
  fetchTimetrackingLive,
  fetchTimetrackingStatus,
  copyFromPreviousWeek,
  patchAssignment,
  publishSchedule,
  runAutoSchedule,
  type CopyFromPreviousWeekResult,
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
};

export function useSchedule(scheduleId: ID, weekStart?: string) {
  return useQuery<Schedule>({
    queryKey: queryKeys.schedule(scheduleId, weekStart),
    queryFn: async () => {
      if (USE_MOCKS) return buildMockSchedule();
      return fetchSchedule(scheduleId, weekStart);
    },
    staleTime: 30_000,
  });
}

export function useEmployees() {
  return useQuery<Employee[]>({
    queryKey: queryKeys.employees(),
    queryFn: () => fetchEmployees(),
    staleTime: 60_000,
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
    staleTime: 5 * 60_000,
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

export function useEmployeeMetrics() {
  return useQuery<EmployeeScheduleMetrics[]>({
    queryKey: queryKeys.metrics(),
    queryFn: async () => {
      if (USE_MOCKS) return mockMetrics;
      // Use 1-week fairness window and transform to EmployeeScheduleMetrics shape.
      const data = await fetchFairness(1);
      return data.employees.map((e) => ({
        employeeId: e.employeeId,
        weeklyAssignedMinutes: Math.round(e.hours * 60),
        weeklyTargetMinutes: 42 * 60, // IL standard week
        fairnessScore: e.score,
      })) as unknown as EmployeeScheduleMetrics[];
    },
    staleTime: 60_000,
  });
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
