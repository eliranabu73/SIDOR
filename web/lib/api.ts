import { getAccessToken } from "./supabase";
import type {
  AssignBody,
  AssignSuccess,
  AssignmentProposal,
  AutoScheduleResponse,
  AutoScheduleWeights,
  Employee,
  ID,
  Schedule,
  Shift,
  ValidateAssignmentResponse,
} from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return headers;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = {
    ...(await authHeaders()),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const message =
      (body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed: ${res.status}`);
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

// --------- Schedule / Shifts ---------

export function fetchSchedule(
  scheduleId: ID,
  weekStart?: string,
): Promise<Schedule> {
  const qs = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : "";
  return request<Schedule>(`/v1/schedules/${scheduleId}${qs}`);
}

export function fetchEmployees(): Promise<Employee[]> {
  return request<Employee[]>(`/v1/employees`);
}

export function validateAssignment(
  shiftId: ID,
  body: { employeeId: ID; action: "assign" | "unassign" | "replace" },
): Promise<ValidateAssignmentResponse> {
  return request<ValidateAssignmentResponse>(
    `/v1/shifts/${shiftId}/validate-assignment`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function patchAssignment(
  shiftId: ID,
  body: AssignBody,
): Promise<AssignSuccess> {
  return request<AssignSuccess>(`/v1/shifts/${shiftId}/assignments`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function unassignEmployee(
  shiftId: ID,
  body: Omit<AssignBody, "action"> & { action?: "unassign" },
): Promise<AssignSuccess> {
  return patchAssignment(shiftId, { ...body, action: "unassign" });
}

export function runAutoSchedule(
  scheduleId: ID,
  options: {
    provider?: "greedy" | "or-tools";
    dryRun?: boolean;
    weights?: Partial<AutoScheduleWeights>;
  } = {},
): Promise<AutoScheduleResponse> {
  return request<AutoScheduleResponse>(
    `/v1/schedules/${scheduleId}/auto-schedule`,
    { method: "POST", body: JSON.stringify(options) },
  );
}

export function applyProposals(
  scheduleId: ID,
  proposals: AssignmentProposal[],
): Promise<{ applied: number }> {
  return request<{ applied: number }>(
    `/v1/schedules/${scheduleId}/apply-proposals`,
    {
      method: "POST",
      body: JSON.stringify({ proposals }),
    },
  );
}

export function publishSchedule(scheduleId: ID): Promise<Schedule> {
  return request<Schedule>(`/v1/schedules/${scheduleId}/publish`, {
    method: "POST",
  });
}

// --------- Shift item helper (locally compute) ---------

export function shiftHasEmployee(shift: Shift, employeeId: ID): boolean {
  return shift.assignments.some(
    (a) => a.employeeId === employeeId && a.status === "assigned",
  );
}
