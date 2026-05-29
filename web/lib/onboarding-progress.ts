"use client";

import { useQueries } from "@tanstack/react-query";
import {
  fetchEmployees,
  fetchMe,
  fetchSettings,
  listShiftTemplates,
  type MeResponse,
  type OrgSettings,
  type ShiftTemplate,
} from "./api";
import type { Employee } from "./types";

export interface OnboardingProgress {
  businessDone: boolean;
  employeesDone: boolean;
  shiftsDone: boolean;
  allDone: boolean;
  completedCount: number;
  totalCount: number;
  isLoading: boolean;
  hasOrg: boolean;
  me: MeResponse | undefined;
  settings: OrgSettings | undefined;
  employees: Employee[] | undefined;
  shiftTemplates: ShiftTemplate[] | undefined;
}

const TOTAL_STEPS = 4;

/**
 * Aggregates onboarding wizard completion across the four user-facing setup steps:
 *   1. business (org name + branch + business hours)
 *   2. employees (>=1 employee)
 *   3. shifts (>=1 shift template)
 *   4. review (implicit — all of above done)
 *
 * Uses React Query in parallel so the four endpoints fire concurrently. Each
 * sub-query is allowed to fail independently (no org yet ⇒ /v1/settings 404)
 * without flipping the whole hook into an error state — `isLoading` only stays
 * true while any query is in flight.
 */
export function useOnboardingProgress(): OnboardingProgress {
  const results = useQueries({
    queries: [
      {
        queryKey: ["onboarding-progress", "me"],
        queryFn: () => fetchMe(),
        staleTime: 10_000,
        retry: false,
      },
      {
        queryKey: ["onboarding-progress", "settings"],
        queryFn: () => fetchSettings(),
        staleTime: 10_000,
        retry: false,
      },
      {
        queryKey: ["onboarding-progress", "employees"],
        queryFn: () => fetchEmployees(),
        staleTime: 10_000,
        retry: false,
      },
      {
        queryKey: ["onboarding-progress", "shift-templates"],
        queryFn: () => listShiftTemplates(),
        staleTime: 10_000,
        retry: false,
      },
    ],
  });

  const [meQ, settingsQ, employeesQ, templatesQ] = results;
  const me = meQ.data;
  const settings = settingsQ.data;
  const employees = employeesQ.data;
  const shiftTemplates = templatesQ.data;

  const hasOrg = (me?.memberships?.length ?? 0) > 0;
  const businessDone = Boolean(
    settings &&
      settings.locations.length > 0 &&
      settings.laborRules.businessHoursStart,
  );
  const employeesDone = (employees?.length ?? 0) >= 1;
  const shiftsDone = (shiftTemplates?.length ?? 0) >= 1;
  const allDone = businessDone && employeesDone && shiftsDone;

  const completedCount =
    (businessDone ? 1 : 0) +
    (employeesDone ? 1 : 0) +
    (shiftsDone ? 1 : 0) +
    (allDone ? 1 : 0);

  // Loading only while any source is still in flight on first load.
  const isLoading = results.some((r) => r.isPending);

  return {
    businessDone,
    employeesDone,
    shiftsDone,
    allDone,
    completedCount,
    totalCount: TOTAL_STEPS,
    isLoading,
    hasOrg,
    me,
    settings,
    employees,
    shiftTemplates,
  };
}
