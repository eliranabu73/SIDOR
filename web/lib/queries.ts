"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import {
  applyProposals,
  fetchEmployees,
  fetchSchedule,
  patchAssignment,
  publishSchedule,
  runAutoSchedule,
  validateAssignment,
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

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";

export const queryKeys = {
  schedule: (id: ID, weekStart?: string) =>
    ["schedule", id, weekStart] as const,
  employees: () => ["employees"] as const,
  metrics: () => ["metrics"] as const,
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
    queryFn: async () => {
      if (USE_MOCKS) return mockEmployees;
      return fetchEmployees();
    },
    staleTime: 60_000,
  });
}

export function useEmployeeMetrics() {
  return useQuery<EmployeeScheduleMetrics[]>({
    queryKey: queryKeys.metrics(),
    queryFn: async () => mockMetrics,
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
