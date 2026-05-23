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
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  // Impersonation token overrides the user's Supabase JWT when present.
  let impersonationToken: string | null = null;
  if (typeof window !== "undefined") {
    try {
      impersonationToken = window.localStorage.getItem("impersonation_token");
    } catch {
      impersonationToken = null;
    }
  }
  if (impersonationToken) {
    headers["authorization"] = `Bearer ${impersonationToken}`;
    headers["x-impersonation"] = "1";
    return headers;
  }
  const token = await getAccessToken();
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

// --------- Vision AI schedule import ---------

export interface ParsedEmployee {
  fullName: string;
  phone?: string;
  role?: string;
}

export interface ParsedShift {
  dayOfWeek: number | string;
  startTime: string;
  endTime: string;
  role?: string;
  employees?: string[];
}

export interface ParsedSchedule {
  employees: ParsedEmployee[];
  shifts: ParsedShift[];
  weekStart?: string;
  confidence: number;
  notes?: string;
}

export interface ParseImportPayload {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  hints?: string;
}

export function parseImportImage(
  payload: ParseImportPayload,
): Promise<ParsedSchedule> {
  return request<ParsedSchedule>(`/v1/import/parse`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ApplyImportPayload {
  weekStart?: string;
  scheduleId?: ID;
  defaultLocationId?: ID;
  employees: Array<{
    fullName: string;
    phone?: string;
    role?: string;
    skip?: boolean;
  }>;
  shifts: Array<{
    dayOfWeek: number | string;
    startTime: string;
    endTime: string;
    role?: string;
    employees?: string[];
    skip?: boolean;
  }>;
}

export interface ApplyImportResult {
  scheduleId: ID;
  createdEmployees: number;
  createdShifts: number;
  createdRoles: number;
  skippedShifts: number;
}

export function applyImport(
  payload: ApplyImportPayload,
): Promise<ApplyImportResult> {
  return request<ApplyImportResult>(`/v1/import/apply`, {
    method: "POST",
    body: JSON.stringify(payload),
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

// --------- Labor Cost Dashboard ---------

export interface LaborCostResponse {
  weekStart: string;
  currency: "ILS";
  totals: {
    hours: number;
    cost: number;
    shifts: number;
    uncoveredHours: number;
    openShifts: number;
    employees: number;
    overtimeEmployees: number;
    employeesWithoutRate: number;
  };
  perEmployee: Array<{
    employeeId: ID;
    fullName: string;
    hourlyRate: number | null;
    hours: number;
    cost: number;
    isOvertime: boolean;
  }>;
  perDay: Array<{ date: string; hours: number; cost: number; shifts: number }>;
  perRole: Array<{ name: string; hours: number; cost: number }>;
  perLocation: Array<{ name: string; hours: number; cost: number }>;
  defaultHourlyRate: number;
}
export function fetchLaborCost(weekStart: string): Promise<LaborCostResponse> {
  return request<LaborCostResponse>(
    `/v1/labor-cost?weekStart=${encodeURIComponent(weekStart)}`,
  );
}

// --------- Labor Cost (per-schedule, agorot-based) ---------

export interface ScheduleLaborCostReport {
  scheduleId: ID;
  weekStart: string;
  currency: "ILS";
  totalAgorot: number;
  avgPerShiftAgorot: number;
  deltaAgorot: number;
  previousTotalAgorot: number | null;
  perEmployee: Array<{
    employeeId: ID;
    name: string;
    hours: number;
    agorot: number;
  }>;
  perShift: Array<{ shiftId: ID; agorot: number }>;
  byDay: Array<{ dayIso: string; agorot: number }>;
}

/** Per-schedule cost meter. Resolves to null when the org has no hourly
 * rates yet — caller should hide the meter UI in that case. */
export function getLaborCost(
  scheduleId: ID,
): Promise<ScheduleLaborCostReport | null> {
  return request<ScheduleLaborCostReport | null>(
    `/v1/schedules/${scheduleId}/labor-cost`,
  );
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

export type ScheduleExportStyle = "minimal" | "branded" | "dark";
export type ScheduleExportFormat = "png" | "pdf";

/** Returns the absolute URL the browser can hit (or anchor-download) for an
 * image/PDF export of a schedule in a given style. */
export function getScheduleExportUrl(
  scheduleId: ID,
  format: ScheduleExportFormat,
  style: ScheduleExportStyle,
): string {
  return `${API_URL}/v1/schedules/${scheduleId}/export.${format}?style=${style}`;
}

export interface EmployeeShareShift {
  id: ID;
  assignmentId: ID;
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
// --------- Fairness Engine ---------

export interface FairnessEmployee {
  employeeId: ID;
  fullName: string;
  score: number;
  hours: number;
  weekendShifts: number;
  nightShifts: number;
  closingShifts: number;
  longestClosingStreak: number;
  flags: string[];
}
export interface FairnessResponse {
  windowDays: number;
  windowStart: string;
  team: {
    medianHours: number;
    medianWeekend: number;
    medianNight: number;
    medianClosing: number;
    employeeCount: number;
  };
  employees: FairnessEmployee[];
}
export function fetchFairness(weeks = 4): Promise<FairnessResponse> {
  return request<FairnessResponse>(`/v1/fairness?weeks=${weeks}`);
}

// --------- Employee actions via share token (time-off + availability) ---------

export interface EmployeeTimeOffItem {
  id: ID;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  status: string;
}
export type AvailabilityType = "available" | "unavailable" | "preferred";
export interface EmployeeAvailabilityRule {
  id: ID;
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  type: AvailabilityType;
}
export interface EmployeeActivity {
  timeOff: EmployeeTimeOffItem[];
  availability: EmployeeAvailabilityRule[];
}

export async function fetchEmployeeActivity(
  token: string,
): Promise<EmployeeActivity> {
  const r = await fetch(
    `${API_URL}/v1/share/${encodeURIComponent(token)}/activity`,
  );
  const body = (await r.json().catch(() => null)) as unknown;
  if (!r.ok) {
    const msg =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `Request failed: ${r.status}`;
    throw new ApiError(msg, r.status, body);
  }
  return body as EmployeeActivity;
}

export async function createTimeOff(
  token: string,
  body: { startsAt: string; endsAt: string; reason?: string },
): Promise<EmployeeTimeOffItem> {
  const r = await fetch(
    `${API_URL}/v1/share/${encodeURIComponent(token)}/time-off`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const j = (await r.json().catch(() => null)) as unknown;
  if (!r.ok) {
    const msg =
      j && typeof j === "object" && "message" in j
        ? String((j as { message: unknown }).message)
        : `Request failed: ${r.status}`;
    throw new ApiError(msg, r.status, j);
  }
  return j as EmployeeTimeOffItem;
}

export async function saveAvailability(
  token: string,
  rules: Array<{
    dayOfWeek: number;
    startLocalTime: string;
    endLocalTime: string;
    type: "AVAILABLE" | "UNAVAILABLE" | "PREFERRED";
  }>,
): Promise<{ rules: EmployeeAvailabilityRule[] }> {
  const r = await fetch(
    `${API_URL}/v1/share/${encodeURIComponent(token)}/availability`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules }),
    },
  );
  const j = (await r.json().catch(() => null)) as unknown;
  if (!r.ok) {
    const msg =
      j && typeof j === "object" && "message" in j
        ? String((j as { message: unknown }).message)
        : `Request failed: ${r.status}`;
    throw new ApiError(msg, r.status, j);
  }
  return j as { rules: EmployeeAvailabilityRule[] };
}

// --------- Shift swap (public from share token + manager queue) ---------

export interface SwapCandidate {
  employeeId: ID;
  fullName: string;
  phone: string | null;
  conflicting: boolean;
}
export interface PendingSwap {
  id: ID;
  createdAt: string;
  requester: { id: ID; fullName: string; phone: string | null };
  shift: {
    id: ID;
    startsAt: string;
    endsAt: string;
    role: string | null;
    location: string | null;
  };
  assignmentId: ID;
}

export async function createSwapRequestFromShare(
  token: string,
  assignmentId: ID,
): Promise<{ id: ID; status: string }> {
  const res = await fetch(
    `${API_URL}/v1/share/${encodeURIComponent(token)}/swap-request`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assignmentId }),
    },
  );
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `Request failed: ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as { id: ID; status: string };
}

export function fetchPendingSwaps(): Promise<PendingSwap[]> {
  return request<PendingSwap[]>(`/v1/swap-requests`);
}
export function fetchSwapCandidates(swapId: ID): Promise<SwapCandidate[]> {
  return request<SwapCandidate[]>(`/v1/swap-requests/${swapId}/candidates`);
}
export function approveSwap(
  swapId: ID,
  targetEmployeeId: ID,
): Promise<{ id: ID; status: string }> {
  return request(`/v1/swap-requests/${swapId}/approve`, {
    method: "POST",
    body: JSON.stringify({ targetEmployeeId }),
  });
}
export function rejectSwap(swapId: ID): Promise<{ id: ID; status: string }> {
  return request(`/v1/swap-requests/${swapId}/reject`, { method: "POST" });
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

// --------- Schedule Templates ---------

export interface ScheduleTemplateItem {
  id: string;
  name: string;
  description: string;
  emoji: string;
  industry: string;
  roles: string[];
  weeklyHours: number;
  color: string;
  shiftCount: number;
}

export interface ApplyTemplateResult {
  scheduleId: ID;
  weekStart: string;
  createdRoles: number;
  createdShifts: number;
  template: string;
}

export function fetchTemplates(): Promise<ScheduleTemplateItem[]> {
  return request<ScheduleTemplateItem[]>(`/v1/templates`);
}

export function applyTemplate(id: string, weekStart?: string): Promise<ApplyTemplateResult> {
  return request<ApplyTemplateResult>(`/v1/templates/${id}/apply`, {
    method: "POST",
    body: JSON.stringify(weekStart ? { weekStart } : {}),
  });
}

// --------- Settings ---------

export interface LaborRules {
  maxHoursDay?: number;
  maxHoursWeek?: number;
  minRestHours?: number;
  shiftTypes?: string[];
  businessHoursStart?: string;
  businessHoursEnd?: string;
  roleRates?: Record<string, number>;
}

export interface OrgRole {
  id: ID;
  name: string;
  description: string | null;
}

export interface OrgLocation {
  id: ID;
  name: string;
  timezone: string | null;
  address: string | null;
}

export interface OrgSettings {
  id: ID;
  name: string;
  industry: string | null;
  defaultTimezone: string;
  weekStartDay: number;
  plan: string;
  laborRules: LaborRules;
  roles: OrgRole[];
  locations: OrgLocation[];
}

export function fetchSettings(): Promise<OrgSettings> {
  return request<OrgSettings>(`/v1/settings`);
}

export function patchSettings(body: Partial<Omit<OrgSettings, "id" | "plan" | "roles" | "locations"> & { laborRules: LaborRules }>): Promise<OrgSettings> {
  return request<OrgSettings>(`/v1/settings`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function updateOrgRole(id: ID, name: string, description?: string | null): Promise<OrgRole> {
  return request<OrgRole>(`/v1/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name, description }),
  });
}

export function deleteOrgRole(id: ID): Promise<void> {
  return request<void>(`/v1/roles/${id}`, { method: "DELETE" });
}

export function updateOrgLocation(id: ID, name: string, timezone?: string | null): Promise<OrgLocation> {
  return request<OrgLocation>(`/v1/locations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name, timezone }),
  });
}

export function deleteOrgLocation(id: ID): Promise<void> {
  return request<void>(`/v1/locations/${id}`, { method: "DELETE" });
}

// --------- Platform Admin (cross-tenant, owner-only) ---------

export interface AdminStats {
  totalOrgs: number;
  totalUsers: number;
  totalEmployees: number;
  totalShifts: number;
  signupsLast7d: number;
  shiftsLast7d: number;
  activeOrgsLast7d: number;
}

export interface AdminOrgListItem {
  id: ID;
  name: string;
  industry: string | null;
  plan: string;
  createdAt: string;
  memberCount: number;
  employeeCount: number;
  scheduleCount: number;
}

export interface AdminOrgListResponse {
  total: number;
  limit: number;
  offset: number;
  items: AdminOrgListItem[];
}

export interface AdminUserListItem {
  userId: string;
  orgCount: number;
  firstJoined: string;
  email?: string | null;
  lastSignInAt?: string | null;
  deactivated?: boolean;
  memberships: Array<{
    role: string;
    joinedAt: string;
    org: { id: ID; name: string };
  }>;
}

export interface AdminAuditItem {
  id: string;
  organizationId: ID;
  scheduleId: ID | null;
  userId: string | null;
  actionType: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  organization: { name: string } | null;
}

export type AdminPlan = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";

export interface AdminSystemHealth {
  ok: boolean;
  checks: {
    db: { ok: boolean; latencyMs?: number; error?: string };
    redis: { ok: boolean; latencyMs?: number; error?: string };
    env: { ok: boolean; missing?: string[] };
  };
  uptimeSec: number;
  version?: string;
  env?: string;
}

export interface AdminChartPoint {
  date: string; // YYYY-MM-DD
  count: number;
}
export interface AdminChartResponse {
  points: AdminChartPoint[];
}

export interface AdminFeatureFlags {
  enableAutoSchedule?: boolean;
  enableSwaps?: boolean;
  enableWhatsAppExport?: boolean;
  enableOrTools?: boolean;
  enableImport?: boolean;
  [key: string]: boolean | undefined;
}

export interface AdminImpersonateResponse {
  token: string;
  expiresAt: string;
  targetUserId: string;
  targetName: string;
}

export const adminApi = {
  check: () => request<{ isAdmin: boolean }>(`/v1/admin/check`),
  stats: () => request<AdminStats>(`/v1/admin/stats`),
  orgs: (params: { search?: string; limit?: number; offset?: number } = {}) => {
    const sp = new URLSearchParams();
    if (params.search) sp.set("search", params.search);
    if (params.limit != null) sp.set("limit", String(params.limit));
    if (params.offset != null) sp.set("offset", String(params.offset));
    const qs = sp.toString();
    return request<AdminOrgListResponse>(`/v1/admin/orgs${qs ? `?${qs}` : ""}`);
  },
  orgDetail: (id: ID) =>
    request<{ org: Record<string, unknown>; recentSchedules: Array<Record<string, unknown>> }>(
      `/v1/admin/orgs/${id}`,
    ),
  users: (params: { search?: string; limit?: number; offset?: number } = {}) => {
    const sp = new URLSearchParams();
    if (params.search) sp.set("search", params.search);
    if (params.limit != null) sp.set("limit", String(params.limit));
    if (params.offset != null) sp.set("offset", String(params.offset));
    const qs = sp.toString();
    return request<{
      total: number;
      limit: number;
      offset: number;
      items: AdminUserListItem[];
    }>(`/v1/admin/users${qs ? `?${qs}` : ""}`);
  },
  audit: (
    params: {
      orgId?: ID;
      action?: string;
      from?: string;
      to?: string;
      limit?: number;
    } = {},
  ) => {
    const sp = new URLSearchParams();
    if (params.orgId) sp.set("orgId", params.orgId);
    if (params.action) sp.set("action", params.action);
    if (params.from) sp.set("from", params.from);
    if (params.to) sp.set("to", params.to);
    if (params.limit != null) sp.set("limit", String(params.limit));
    const qs = sp.toString();
    return request<{ items: AdminAuditItem[] }>(
      `/v1/admin/audit${qs ? `?${qs}` : ""}`,
    );
  },
  updatePlan: (id: ID, plan: AdminPlan) =>
    request<{ id: ID; plan: AdminPlan }>(`/v1/admin/orgs/${id}/plan`, {
      method: "PATCH",
      body: JSON.stringify({ plan }),
    }),
  softDelete: (id: ID) =>
    request<{ id: ID; deletedAt: string }>(`/v1/admin/orgs/${id}`, {
      method: "DELETE",
    }),
  deactivateUser: (userId: string, deactivated: boolean) =>
    request<{ userId: string; deactivated: boolean }>(
      `/v1/admin/users/${userId}/deactivate`,
      {
        method: "PATCH",
        body: JSON.stringify({ deactivated }),
      },
    ),
  systemHealth: () => request<AdminSystemHealth>(`/v1/admin/system-health`),
  signupsChart: (days = 30) =>
    request<AdminChartResponse>(`/v1/admin/charts/signups?days=${days}`),
  shiftsChart: (days = 30) =>
    request<AdminChartResponse>(`/v1/admin/charts/shifts?days=${days}`),
  exportCsv: (type: "orgs" | "users" | "audit"): string => {
    return `${API_URL}/v1/admin/export?type=${encodeURIComponent(type)}`;
  },
  updateFeatureFlags: (id: ID, flags: AdminFeatureFlags) =>
    request<{ id: ID; flags: AdminFeatureFlags }>(
      `/v1/admin/orgs/${id}/feature-flags`,
      {
        method: "PATCH",
        body: JSON.stringify({ flags }),
      },
    ),
  impersonate: (userId: string) =>
    request<AdminImpersonateResponse>(`/v1/admin/impersonate`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
};

// --------- WS-E: IL Compliance Engine ---------

export type ComplianceSeverity = "info" | "warning" | "blocking";

export interface ComplianceViolation {
  ruleCode: string;
  severity: ComplianceSeverity;
  message: string;
  shiftId?: ID | null;
  employeeId?: ID | null;
  metadata?: Record<string, unknown>;
}

export interface ComplianceReport {
  scheduleId: ID;
  generatedAt: string;
  violations: ComplianceViolation[];
}

/**
 * Fetch the IL labor-compliance report for a schedule.
 *
 * Falls back to an empty report if the backend endpoint is not yet deployed
 * (so the UI degrades gracefully during rollout).
 */
export async function getComplianceReport(
  scheduleId: ID,
): Promise<ComplianceReport> {
  try {
    return await request<ComplianceReport>(
      `/v1/schedules/${encodeURIComponent(scheduleId)}/compliance`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return { scheduleId, generatedAt: new Date().toISOString(), violations: [] };
    }
    throw err;
  }
}
