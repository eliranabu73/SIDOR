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
  const authH = await authHeaders() as Record<string, string>;
  // Don't send Content-Type: application/json when there is no body —
  // Fastify rejects the combination with FST_ERR_CTP_EMPTY_JSON_BODY.
  const headers: Record<string, string> = {
    ...authH,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (!init.body) delete headers["content-type"];
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

/** Employee with pre-aggregated constraint count — avoids N+1 availability+preferences calls. */
export interface EmployeeSummary extends Employee {
  constraintCount: number;
}

/** Fetch all employees with their constraint counts in a single request. */
export function fetchEmployeesSummary(): Promise<EmployeeSummary[]> {
  return request<EmployeeSummary[]>(`/v1/employees/summary`);
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
  hourlyRate?: number;
  hireDate?: string | null;
  weeklyBudgetHours?: number | null;
}

export interface UpdateEmployeeBody {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  employmentType?: EmploymentType;
  roleIds?: ID[];
  defaultLocationId?: ID | null;
  hourlyRate?: number;
  hireDate?: string | null;
  weeklyBudgetHours?: number | null;
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
  role: "OWNER" | "MANAGER" | "BRANCH_MANAGER";
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

export interface SchedulePosterLink {
  url: string;
  expiresInDays: number;
}

/**
 * Manager-only: mint a public 7-day signed URL for the schedule poster PNG.
 * The URL is crawlable, so WhatsApp renders it as an image preview when the
 * link is pasted into a chat (no file attachment needed).
 */
export function getSchedulePosterLink(
  scheduleId: ID,
  style: ScheduleExportStyle = "branded",
): Promise<SchedulePosterLink> {
  return request<SchedulePosterLink>(
    `/v1/share/schedules/${scheduleId}/poster-link?style=${style}`,
    { method: "POST" },
  );
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

export interface CopyFromPreviousWeekResult {
  copied: number;
  skipped: number;
  message?: string;
  existingBefore?: number;
}

export function copyFromPreviousWeek(
  scheduleId: ID,
): Promise<CopyFromPreviousWeekResult> {
  return request<CopyFromPreviousWeekResult>(
    `/v1/schedules/${scheduleId}/copy-from-previous-week`,
    { method: "POST" },
  );
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
  logoUrl: string | null;
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

/**
 * Upload a logo file to Supabase Storage and persist the public URL via PATCH /v1/settings.
 */
export async function uploadOrgLogo(
  orgId: string,
  file: File,
  getSupabaseClient: () => import("@supabase/supabase-js").SupabaseClient,
): Promise<OrgSettings> {
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${orgId}/logo.${ext}`;
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage
    .from("logos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("logos").getPublicUrl(path);
  const logoUrl = `${data.publicUrl}?t=${Date.now()}`;
  return patchSettings({ logoUrl });
}

/**
 * Remove the org logo: delete from storage and clear the DB field.
 */
export async function removeOrgLogo(
  _orgId: string,
  logoUrl: string | null,
  getSupabaseClient: () => import("@supabase/supabase-js").SupabaseClient,
): Promise<OrgSettings> {
  if (logoUrl) {
    const supabase = getSupabaseClient();
    const match = logoUrl.match(/\/object\/public\/logos\/(.+?)(\?|$)/);
    if (match?.[1]) {
      await supabase.storage.from("logos").remove([match[1]]);
    }
  }
  return patchSettings({ logoUrl: null });
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

// --------- Team Members / Roles ---------

export type MembershipRole = "OWNER" | "MANAGER" | "BRANCH_MANAGER";

export interface OrgMember {
  id: ID;
  userId: ID;
  role: MembershipRole;
  locationId: ID | null;
  createdAt: string;
  location: { id: ID; name: string } | null;
}

export function fetchOrgMembers(): Promise<OrgMember[]> {
  return request<OrgMember[]>(`/v1/settings/members`);
}

export function patchMemberRole(
  userId: ID,
  role: "MANAGER" | "BRANCH_MANAGER",
  locationId?: ID,
): Promise<OrgMember> {
  return request<OrgMember>(`/v1/settings/members/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role, locationId }),
  });
}

// --------- Promote employee to manager (owner only) ---------

export interface PromoteEmployeeBody {
  employeeId: ID;
  password: string;
  role: "MANAGER" | "BRANCH_MANAGER";
  locationId?: ID;
}

export interface PromoteEmployeeResponse {
  member: OrgMember;
  credentials: { email: string; password: string };
}

export function promoteEmployeeToManager(
  body: PromoteEmployeeBody,
): Promise<PromoteEmployeeResponse> {
  return request<PromoteEmployeeResponse>(`/v1/settings/members/from-employee`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --------- Shift templates (owner/manager) ---------

export interface ShiftTemplate {
  id: ID;
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  requiredEmployeeCount: number;
  crossesMidnight: boolean;
  locationId: ID | null;
  roleId: ID | null;
  timezone: string;
}

export interface ShiftTemplateInput {
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  requiredEmployeeCount?: number;
  locationId?: ID | null;
  roleId?: ID | null;
}

export function listShiftTemplates(): Promise<ShiftTemplate[]> {
  return request<ShiftTemplate[]>(`/v1/settings/shift-templates`);
}

export function createShiftTemplate(input: ShiftTemplateInput): Promise<ShiftTemplate> {
  return request<ShiftTemplate>(`/v1/settings/shift-templates`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateShiftTemplate(
  id: ID,
  input: Partial<ShiftTemplateInput>,
): Promise<ShiftTemplate> {
  return request<ShiftTemplate>(`/v1/settings/shift-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteShiftTemplate(id: ID): Promise<void> {
  return request<void>(`/v1/settings/shift-templates/${id}`, { method: "DELETE" });
}

// --------- Schedule approval workflow ---------

export function submitScheduleForApproval(scheduleId: ID): Promise<{ status: string }> {
  return request<{ status: string }>(`/v1/schedules/${scheduleId}/submit`, {
    method: "POST",
  });
}

export function approveSchedule(scheduleId: ID): Promise<{ status: string }> {
  return request<{ status: string }>(`/v1/schedules/${scheduleId}/approve`, {
    method: "POST",
  });
}

export function rejectSchedule(
  scheduleId: ID,
  note?: string,
): Promise<{ status: string }> {
  return request<{ status: string }>(`/v1/schedules/${scheduleId}/reject`, {
    method: "POST",
    body: JSON.stringify({ note: note ?? undefined }),
  });
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

// --------- WS-F: Payroll Export ---------

export type PayrollFormat = "standard" | "hilan";

/**
 * Download a payroll CSV for the given date range. Returns a Blob the
 * caller can hand to a temporary anchor for download. periodStart/periodEnd
 * are YYYY-MM-DD strings (periodEnd inclusive).
 */
export async function downloadPayrollCsv(input: {
  periodStart: string;
  periodEnd: string;
  format: PayrollFormat;
}): Promise<{ blob: Blob; filename: string }> {
  const qs = new URLSearchParams({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    format: input.format,
  }).toString();
  const headers = await authHeaders();
  // CSV endpoint — content-type override is fine, server ignores it.
  const res = await fetch(`${API_URL}/v1/payroll/export.csv?${qs}`, {
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(`Request failed: ${res.status}`, res.status, text);
  }
  const blob = await res.blob();
  // Try to extract filename from content-disposition.
  const cd = res.headers.get("content-disposition") ?? "";
  const match = cd.match(/filename="?([^";]+)"?/);
  const filename =
    match?.[1] ?? `payroll-${input.format}-${input.periodStart}_${input.periodEnd}.csv`;
  return { blob, filename };
}

// --------- WS-F: Time-Off Manager Inbox ---------
//
// NOTE: the backend currently exposes time-off CREATION via the public
// share token (`POST /v1/share/:token/time-off`), but there is no
// authenticated manager-side endpoint for listing or approving/rejecting
// requests. The wrappers below assume a future `/v1/timeoff` resource —
// if the server returns 404 the inbox UI will degrade to an empty list.

export type TimeOffStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export interface TimeOffRequestItem {
  id: ID;
  employeeId: ID;
  employeeName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  reason: string | null;
  status: TimeOffStatus;
  createdAt: string;
}

export async function getTimeOffRequests(
  status?: TimeOffStatus,
): Promise<TimeOffRequestItem[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  try {
    // Backend returns { items: [...] } — unwrap for UI consumption.
    const res = await request<{ items: TimeOffRequestItem[] } | TimeOffRequestItem[]>(`/v1/timeoff${qs}`);
    return Array.isArray(res) ? res : res.items;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
}

export function approveTimeOff(
  id: ID,
): Promise<{ id: ID; status: TimeOffStatus }> {
  return request<{ id: ID; status: TimeOffStatus }>(
    `/v1/timeoff/${id}/approve`,
    { method: "POST" },
  );
}

export function rejectTimeOff(
  id: ID,
): Promise<{ id: ID; status: TimeOffStatus }> {
  return request<{ id: ID; status: TimeOffStatus }>(
    `/v1/timeoff/${id}/reject`,
    { method: "POST" },
  );
}

// --------- Manager-side employee availability + preferences ---------

export type ManagerAvailabilityType =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "PREFERRED";

export interface ManagerAvailabilityRule {
  id: ID;
  dayOfWeek: number; // 0..6 (Sunday=0)
  startLocalTime: string; // "HH:mm:ss"
  endLocalTime: string;
  availabilityType: ManagerAvailabilityType;
  timezone: string;
}

export function fetchEmployeeAvailability(
  employeeId: ID,
): Promise<{ rules: ManagerAvailabilityRule[] }> {
  return request<{ rules: ManagerAvailabilityRule[] }>(
    `/v1/employees/${employeeId}/availability`,
  );
}

export function saveEmployeeAvailability(
  employeeId: ID,
  rules: Array<{
    dayOfWeek: number;
    startLocalTime: string;
    endLocalTime: string;
    availabilityType: ManagerAvailabilityType;
  }>,
): Promise<{ rules: ManagerAvailabilityRule[] }> {
  return request<{ rules: ManagerAvailabilityRule[] }>(
    `/v1/employees/${employeeId}/availability`,
    {
      method: "PUT",
      body: JSON.stringify({ rules }),
    },
  );
}

export interface EmployeePreferencesPayload {
  maxHoursPerWeek?: number | null;
  preferredHoursPerWeek?: number | null;
  minShiftsPerWeek?: number | null;
  maxShiftsPerWeek?: number | null;
  preferredShiftsPerWeek?: number | null;
  prefersMornings?: boolean;
  prefersEvenings?: boolean;
  prefersWeekends?: boolean;
  avoidBackToBackShifts?: boolean;
  preferredShiftLength?: number | null;
  noWorkAfter?: string | null;
  noWorkBefore?: string | null;
  avoidWeekends?: boolean;
  avoidNightShifts?: boolean;
  notes?: string | null;
}

export function fetchEmployeePreferences(
  employeeId: ID,
): Promise<EmployeePreferencesPayload | null> {
  return request<EmployeePreferencesPayload | null>(
    `/v1/employees/${employeeId}/preferences`,
  );
}

export function saveEmployeePreferences(
  employeeId: ID,
  body: EmployeePreferencesPayload,
): Promise<EmployeePreferencesPayload> {
  return request<EmployeePreferencesPayload>(
    `/v1/employees/${employeeId}/preferences`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}

// Manager-side time-off list filtered to a single employee.
// The /v1/timeoff endpoint returns { items: [...] } with UTC field names —
// normalize to TimeOffRequestItem shape for UI consumption.
export interface RawTimeOffItem {
  id: ID;
  employeeId: ID;
  employeeName: string;
  startAtUtc: string;
  endAtUtc: string;
  timezone: string;
  reason: string | null;
  status: TimeOffStatus;
  createdAt: string;
}

export async function fetchTimeOffForEmployee(
  employeeId: ID,
): Promise<TimeOffRequestItem[]> {
  try {
    const res = await request<{ items: RawTimeOffItem[] } | RawTimeOffItem[]>(
      `/v1/timeoff`,
    );
    const items: RawTimeOffItem[] = Array.isArray(res)
      ? res
      : (res?.items ?? []);
    return items
      .filter((t) => t.employeeId === employeeId)
      .map((t) => ({
        id: t.id,
        employeeId: t.employeeId,
        employeeName: t.employeeName,
        startsAt: t.startAtUtc,
        endsAt: t.endAtUtc,
        timezone: t.timezone,
        reason: t.reason,
        status: t.status,
        createdAt: t.createdAt,
      }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return [];
    throw err;
  }
}

// --------- Time Tracking (שעון נוכחות) ---------

export interface TimetrackingStatusResponse {
  clockedIn: boolean;
  clockInAt: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  shiftAssignmentId?: string | null;
}

export interface TimetrackingClockResponse {
  id: string;
  clockedIn: boolean;
  clockInAt: string | null;
  clockOutAt: string | null;
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  clockInAt: string;
  clockOutAt: string | null;
  durationMinutes: number | null;
  shiftAssignmentId: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  scheduledMinutes: number | null;
  note: string | null;
}

export interface LiveClockStatus {
  employeeId: string;
  employeeName: string;
  clockInAt: string;
}

export interface TimetrackingLiveResponse {
  count: number;
  employees: LiveClockStatus[];
}

export function clockIn(body: {
  shiftAssignmentId?: string;
  note?: string;
}): Promise<TimetrackingClockResponse> {
  return request<TimetrackingClockResponse>(`/v1/timetracking/clock-in`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function clockOut(): Promise<TimetrackingClockResponse> {
  return request<TimetrackingClockResponse>(`/v1/timetracking/clock-out`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function fetchTimetrackingStatus(): Promise<TimetrackingStatusResponse> {
  return request<TimetrackingStatusResponse>(`/v1/timetracking/status`);
}

export function fetchTimeEntries(
  from: string,
  to: string,
  employeeId?: string,
): Promise<TimeEntry[]> {
  const params = new URLSearchParams({
    from,
    to,
    ...(employeeId ? { employeeId } : {}),
  });
  return request<TimeEntry[]>(`/v1/timetracking/entries?${params}`);
}

export function fetchTimetrackingLive(): Promise<TimetrackingLiveResponse> {
  return request<TimetrackingLiveResponse>(`/v1/timetracking/live`);
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export interface TokenClockStatus {
  clockedIn: boolean;
  clockInAt: string | null;
}

export async function tokenClockIn(token: string): Promise<TokenClockStatus> {
  const r = await fetch(
    `${API_BASE}/v1/timetracking/token/${encodeURIComponent(token)}/clock-in`,
    { method: "POST" },
  );
  return r.json() as Promise<TokenClockStatus>;
}

export async function tokenClockOut(token: string): Promise<TokenClockStatus> {
  const r = await fetch(
    `${API_BASE}/v1/timetracking/token/${encodeURIComponent(token)}/clock-out`,
    { method: "POST" },
  );
  return r.json() as Promise<TokenClockStatus>;
}

export async function fetchTokenClockStatus(
  token: string,
): Promise<TokenClockStatus> {
  const r = await fetch(
    `${API_BASE}/v1/timetracking/token/${encodeURIComponent(token)}/status`,
  );
  return r.json() as Promise<TokenClockStatus>;
}

// --------- Tips (חוק הטיפים 2022) ---------

export interface TipDistributionItem {
  id: string;
  employeeId: string;
  employee: { id: string; fullName: string };
  shiftMinutes: number;
  amountAgorot: number;
}

export interface TipPoolItem {
  id: string;
  organizationId: string;
  shiftDate: string;
  locationId: string | null;
  location: { id: string; name: string } | null;
  totalAgorot: number;
  note: string | null;
  createdAt: string;
  distributions: TipDistributionItem[];
}

export interface TipDistributionPreview {
  employeeId: string;
  employeeName: string;
  shiftMinutes: number;
  amountAgorot: number;
}

export interface TipPreviewResponse {
  shiftDate: string;
  totalAgorot: number;
  distributions: TipDistributionPreview[];
}

export interface RecordTipBody {
  shiftDate: string;
  locationId?: string;
  totalAgorot: number;
  note?: string;
}

export function previewTipDistribution(
  shiftDate: string,
  totalAgorot: number,
  locationId?: string,
): Promise<TipPreviewResponse> {
  const params = new URLSearchParams({ shiftDate, totalAgorot: String(totalAgorot) });
  if (locationId) params.set("locationId", locationId);
  return request<TipPreviewResponse>(`/v1/tips/preview?${params.toString()}`);
}

export function fetchTipPools(
  periodStart: string,
  periodEnd: string,
  locationId?: string,
): Promise<TipPoolItem[]> {
  const params = new URLSearchParams({ periodStart, periodEnd });
  if (locationId) params.set("locationId", locationId);
  return request<TipPoolItem[]>(`/v1/tips?${params.toString()}`);
}

export function recordTipPool(body: RecordTipBody): Promise<TipPoolItem> {
  return request<TipPoolItem>(`/v1/tips`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteTipPool(id: string): Promise<void> {
  return request<void>(`/v1/tips/${id}`, { method: "DELETE" });
}
