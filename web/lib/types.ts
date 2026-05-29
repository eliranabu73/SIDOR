// Minimal handwritten types that mirror the backend response shapes.
// Keep in sync with prisma/schema.prisma and the Fastify route handlers.

export type ID = string;
export type ISODateTime = string;

export type Role = string;

export interface Organization {
  id: ID;
  name: string;
  timezone: string;
}

export interface Location {
  id: ID;
  orgId: ID;
  name: string;
}

export interface Employee {
  id: ID;
  orgId: ID;
  fullName: string;
  email: string | null;
  phone?: string | null;
  roles: Role[];
  primaryLocationId: ID | null;
  active: boolean;
  maxHoursPerWeek?: number | null;
  minHoursPerWeek?: number | null;
  avatarUrl?: string | null;
  hourlyRate: number;
  hireDate?: string | null;
  weeklyBudgetHours?: number | null;
}

export interface ShiftAssignment {
  id: ID;
  shiftId: ID;
  employeeId: ID;
  status: "assigned" | "tentative" | "swapped" | "cancelled";
  createdAt: ISODateTime;
}

export interface Shift {
  id: ID;
  scheduleId: ID;
  locationId: ID;
  role: Role;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  requiredCount: number;
  version: number;
  notes?: string | null;
  /** Backend `isOpenShift` — shift is opted-in for employees to claim. */
  isOpen?: boolean;
  /** Soft-lock from Redis (when another manager is editing). */
  lockedByUserId?: ID | null;
  lockedByName?: string | null;
  assignments: ShiftAssignment[];
}

export interface Schedule {
  id: ID;
  orgId: ID;
  weekStart: ISODateTime; // ISO date for Sunday start
  status: "draft" | "pending_approval" | "approved" | "published" | "archived" | "locked";
  shifts: Shift[];
}

export type RuleSeverity = "info" | "warning" | "error";

export interface RuleResult {
  code: string;
  severity: RuleSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidateAssignmentResponse {
  ok: boolean;
  violations: RuleResult[];
  warnings: RuleResult[];
  expectedShiftVersion: number;
}

export type AssignAction = "assign" | "unassign" | "replace";

export interface AssignBody {
  employeeId: ID;
  expectedShiftVersion: number;
  action: AssignAction;
  acknowledgeWarnings?: boolean;
  replaceEmployeeId?: ID;
}

export interface AssignSuccess {
  shift: Shift;
  warnings: RuleResult[];
}

export interface ApiErrorBody {
  error: string;
  code?:
    | "VERSION_MISMATCH"
    | "WARNINGS_REQUIRE_ACK"
    | "CONSTRAINTS_VIOLATED"
    | "UNAUTHORIZED"
    | string;
  warnings?: RuleResult[];
  violations?: RuleResult[];
  shift?: Shift;
}

export interface EmployeeScheduleMetrics {
  employeeId: ID;
  weeklyAssignedMinutes: number;
  weeklyTargetMinutes: number;
  fairnessScore: number; // 0..1, higher = more fair
}

export interface AssignmentProposal {
  shiftId: ID;
  employeeId: ID;
  score: number;
  reasoning?: string;
  warnings?: RuleResult[];
}

export interface AutoScheduleResponse {
  proposals: AssignmentProposal[];
  unfilled: { shiftId: ID; reason: string }[];
  metrics?: Record<string, number>;
  /** Live labor-cost estimate computed alongside the proposal pass.
   * `null` when the org has no hourly rates set on any employee. */
  costEstimate?: { totalAgorot: number; deltaAgorot: number } | null;
}

export interface AutoScheduleWeights {
  fairness: number;
  preference: number;
  continuity: number;
  cost: number;
}

export interface Claim {
  id: ID;
  shiftId: ID;
  employeeId: ID;
  status: "pending" | "approved" | "rejected";
}

export interface Swap {
  id: ID;
  requesterEmployeeId: ID;
  fromShiftId: ID;
  toShiftId: ID;
  status: "pending" | "approved" | "rejected";
}
