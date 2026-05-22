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

// --------- Employees CRUD ---------

export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACTOR"
  | "TEMPORARY"
  | "INTERN";

export interface CreateEmployeeBody {
  fullName: string;
  email?: string;
  phone?: string;
  employmentType?: EmploymentType;
  roleIds?: ID[];
  defaultLocationId?: ID;
}

export interface UpdateEmployeeBody {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  employmentType?: EmploymentType;
  roleIds?: ID[];
  defaultLocationId?: ID | null;
}

export function createEmployee(body: CreateEmployeeBody): Promise<Employee> {
  return request<Employee>(`/v1/employees`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateEmployee(
  id: ID,
  body: UpdateEmployeeBody,
): Promise<Employee> {
  return request<Employee>(`/v1/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteEmployee(id: ID): Promise<Employee> {
  return request<Employee>(`/v1/employees/${id}`, { method: "DELETE" });
}

// --------- Locations & Roles ---------

export interface LocationItem {
  id: ID;
  name: string;
  timezone: string;
}

export interface RoleItem {
  id: ID;
  name: string;
}

export interface CreateLocationBody {
  name: string;
  timezone?: string;
}

export interface CreateRoleBody {
  name: string;
}

export function fetchLocations(): Promise<LocationItem[]> {
  return request<LocationItem[]>(`/v1/locations`);
}

export function fetchRoles(): Promise<RoleItem[]> {
  return request<RoleItem[]>(`/v1/roles`);
}

export function createLocation(body: CreateLocationBody): Promise<LocationItem> {
  return request<LocationItem>(`/v1/locations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createRole(body: CreateRoleBody): Promise<RoleItem> {
  return request<RoleItem>(`/v1/roles`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --------- Onboarding / Me ---------

export interface MeMembership {
  orgId: ID;
  orgName: string;
  role: "OWNER" | "MANAGER";
}
export interface MeResponse {
  user: { id: string; role: string };
  memberships: MeMembership[];
  activeOrgId: ID | null;
}

export function fetchMe(): Promise<MeResponse> {
  return request<MeResponse>(`/v1/me`);
}

export interface CreateOrgBody {
  name: string;
  defaultTimezone?: string;
  industry?: string;
  defaultLocationName?: string;
}
export interface CreateOrgResult {
  orgId: ID;
  scheduleId: ID;
  membershipId: ID;
}
export function createOrg(body: CreateOrgBody): Promise<CreateOrgResult> {
  return request<CreateOrgResult>(`/v1/orgs`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --------- Schedule provisioning + manual shift creation ---------

export interface EnsureScheduleResult {
  id: ID;
  weekStart: string;
  status: string;
}
export function ensureSchedule(weekStart: string): Promise<EnsureScheduleResult> {
  return request<EnsureScheduleResult>(`/v1/schedules/ensure`, {
    method: "POST",
    body: JSON.stringify({ weekStart }),
  });
}

export interface CreateShiftBody {
  scheduleId: ID;
  locationId: ID;
  roleId: ID;
  startAtUtc: string;
  endAtUtc: string;
  requiredEmployeeCount?: number;
  timezone?: string;
}
export function createShift(body: CreateShiftBody): Promise<Shift> {
  return request<Shift>(`/v1/shifts`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --------- Share / Publish to WhatsApp ---------

export interface PublishLink {
  employeeId: ID;
  fullName: string;
  phone: string | null;
  url: string;
  whatsapp: string;
}
export interface PublishBundle {
  weekStart: string;
  weekEnd: string;
  groupMessage: string;
  links: PublishLink[];
}
export function fetchPublishBundle(scheduleId: ID): Promise<PublishBundle> {
  return request<PublishBundle>(
    `/v1/schedules/${scheduleId}/publish-message`,
    { method: "POST" },
  );
}

export interface EmployeeShareShift {
  id: ID;
  startsAt: string;
  endsAt: string;
  role: string | null;
  location: string | null;
  status: string;
}
export interface EmployeeShareView {
  employee: { id: ID; fullName: string; phone: string | null; email: string | null };
  organization: { name: string; defaultTimezone: string } | null;
  shifts: EmployeeShareShift[];
}
export async function fetchEmployeeShare(
  token: string,
): Promise<EmployeeShareView> {
  // Public endpoint — no auth headers.
  const res = await fetch(`${API_URL}/v1/share/${encodeURIComponent(token)}/me`);
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `Request failed: ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as EmployeeShareView;
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
