-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'INTERN');

-- CreateEnum
CREATE TYPE "AvailabilityType" AS ENUM ('AVAILABLE', 'PREFERRED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "TimeOffStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('MANUAL', 'AUTO_SCHEDULER', 'OPEN_SHIFT_CLAIM', 'SHIFT_SWAP', 'IMPORT');

-- CreateEnum
CREATE TYPE "BreakType" AS ENUM ('PAID', 'UNPAID', 'MEAL', 'REST', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OpenShiftClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('PENDING', 'APPROVED_BY_TARGET', 'APPROVED_BY_MANAGER', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RuleSeverity" AS ENUM ('INFO', 'WARNING', 'BLOCKING');

-- CreateEnum
CREATE TYPE "RuleOperator" AS ENUM ('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IN', 'NOT_IN', 'CONTAINS');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'UNASSIGN', 'PUBLISH', 'LOCK', 'UNLOCK', 'AUTO_SCHEDULE', 'IMPORT');

-- CreateEnum
CREATE TYPE "DomainEventType" AS ENUM ('SHIFT_ASSIGNED', 'SHIFT_UNASSIGNED', 'SHIFT_REPLACED', 'SHIFT_UPDATED', 'OPEN_SHIFT_CLAIMED', 'OPEN_SHIFT_APPROVED', 'SWAP_REQUESTED', 'SWAP_APPROVED', 'SWAP_REJECTED', 'SCHEDULE_PUBLISHED', 'SCHEDULE_LOCKED', 'RULE_VIOLATED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "defaultTimezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "weekStartDay" INTEGER NOT NULL DEFAULT 0,
    "laborRulesJsonb" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "address" TEXT,
    "laborRulesJsonb" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locationId" UUID,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "defaultLocationId" UUID,
    "defaultTimezone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_roles" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "skillLevel" INTEGER NOT NULL DEFAULT 1,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_availability_rules" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startLocalTime" TEXT NOT NULL,
    "endLocalTime" TEXT NOT NULL,
    "availabilityType" "AvailabilityType" NOT NULL DEFAULT 'AVAILABLE',
    "timezone" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_preferences" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "minShiftsPerWeek" INTEGER,
    "maxShiftsPerWeek" INTEGER,
    "preferredShiftsPerWeek" INTEGER,
    "maxHoursPerWeek" INTEGER,
    "preferredHoursPerWeek" INTEGER,
    "prefersMornings" BOOLEAN NOT NULL DEFAULT false,
    "prefersEvenings" BOOLEAN NOT NULL DEFAULT false,
    "prefersWeekends" BOOLEAN NOT NULL DEFAULT false,
    "avoidBackToBackShifts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_shift_preferences" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startLocalTime" TEXT NOT NULL,
    "endLocalTime" TEXT NOT NULL,
    "preferenceScore" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_shift_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_time_off_requests" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "startAtUtc" TIMESTAMP(3) NOT NULL,
    "endAtUtc" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "reason" TEXT,
    "status" "TimeOffStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_time_off_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locationId" UUID,
    "name" TEXT NOT NULL,
    "periodStartDate" DATE NOT NULL,
    "periodEndDate" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "lockedByUserId" UUID,
    "lockedUntil" TIMESTAMP(3),
    "createdByUserId" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locationId" UUID,
    "departmentId" UUID,
    "roleId" UUID,
    "name" TEXT NOT NULL,
    "startLocalTime" TEXT NOT NULL,
    "endLocalTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "crossesMidnight" BOOLEAN NOT NULL DEFAULT false,
    "requiredEmployeeCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locationId" UUID,
    "departmentId" UUID,
    "roleId" UUID,
    "templateId" UUID,
    "scheduleId" UUID,
    "startAtUtc" TIMESTAMP(3) NOT NULL,
    "endAtUtc" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "localStartDate" DATE NOT NULL,
    "localEndDate" DATE NOT NULL,
    "requiredEmployeeCount" INTEGER NOT NULL DEFAULT 1,
    "status" "ShiftStatus" NOT NULL DEFAULT 'PLANNED',
    "isOpenShift" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "assignmentStatus" "AssignmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "AssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "assignedByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_breaks" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "breakType" "BreakType" NOT NULL DEFAULT 'UNPAID',
    "durationMinutes" INTEGER NOT NULL,
    "startAtUtc" TIMESTAMP(3),
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_shift_claims" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "status" "OpenShiftClaimStatus" NOT NULL DEFAULT 'PENDING',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "open_shift_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_swap_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sourceAssignmentId" UUID NOT NULL,
    "requestingEmployeeId" UUID NOT NULL,
    "targetEmployeeId" UUID,
    "status" "SwapStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByManagerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_rule_definitions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "severity" "RuleSeverity" NOT NULL DEFAULT 'WARNING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_rule_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_rule_conditions" (
    "id" UUID NOT NULL,
    "customRuleDefinitionId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "operator" "RuleOperator" NOT NULL,
    "valueJsonb" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_rule_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_violations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "scheduleId" UUID,
    "shiftId" UUID,
    "employeeId" UUID,
    "ruleCode" TEXT NOT NULL,
    "severity" "RuleSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "metadataJsonb" JSONB NOT NULL DEFAULT '{}',
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_schedule_metrics" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "scheduleId" UUID,
    "employeeId" UUID NOT NULL,
    "weekStartDate" DATE NOT NULL,
    "totalScheduledMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalPaidMinutes" INTEGER NOT NULL DEFAULT 0,
    "shiftCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveWorkDays" INTEGER NOT NULL DEFAULT 0,
    "lastShiftEndAtUtc" TIMESTAMP(3),
    "nextShiftStartAtUtc" TIMESTAMP(3),
    "weekendShiftCount" INTEGER NOT NULL DEFAULT 0,
    "nightShiftCount" INTEGER NOT NULL DEFAULT 0,
    "morningShiftCount" INTEGER NOT NULL DEFAULT 0,
    "eveningShiftCount" INTEGER NOT NULL DEFAULT 0,
    "fairnessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_schedule_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_audit_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "scheduleId" UUID,
    "userId" UUID,
    "actionType" "AuditActionType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeDataJsonb" JSONB,
    "afterDataJsonb" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "eventType" "DomainEventType" NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payloadJsonb" JSONB NOT NULL DEFAULT '{}',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling_candidates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "eligibilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "violationsCount" INTEGER NOT NULL DEFAULT 0,
    "warningsCount" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduling_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locations_organizationId_idx" ON "locations"("organizationId");

-- CreateIndex
CREATE INDEX "departments_organizationId_idx" ON "departments"("organizationId");

-- CreateIndex
CREATE INDEX "departments_locationId_idx" ON "departments"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organizationId_name_key" ON "roles"("organizationId", "name");

-- CreateIndex
CREATE INDEX "employees_organizationId_idx" ON "employees"("organizationId");

-- CreateIndex
CREATE INDEX "employees_organizationId_isActive_idx" ON "employees"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organizationId_email_key" ON "employees"("organizationId", "email");

-- CreateIndex
CREATE INDEX "employee_roles_roleId_idx" ON "employee_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_roles_employeeId_roleId_key" ON "employee_roles"("employeeId", "roleId");

-- CreateIndex
CREATE INDEX "employee_availability_rules_employeeId_dayOfWeek_idx" ON "employee_availability_rules"("employeeId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "employee_preferences_employeeId_key" ON "employee_preferences"("employeeId");

-- CreateIndex
CREATE INDEX "employee_shift_preferences_employeeId_dayOfWeek_idx" ON "employee_shift_preferences"("employeeId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "employee_time_off_requests_employeeId_startAtUtc_idx" ON "employee_time_off_requests"("employeeId", "startAtUtc");

-- CreateIndex
CREATE INDEX "schedules_organizationId_periodStartDate_idx" ON "schedules"("organizationId", "periodStartDate");

-- CreateIndex
CREATE INDEX "schedules_locationId_status_idx" ON "schedules"("locationId", "status");

-- CreateIndex
CREATE INDEX "shift_templates_organizationId_idx" ON "shift_templates"("organizationId");

-- CreateIndex
CREATE INDEX "shifts_organizationId_startAtUtc_idx" ON "shifts"("organizationId", "startAtUtc");

-- CreateIndex
CREATE INDEX "shifts_scheduleId_idx" ON "shifts"("scheduleId");

-- CreateIndex
CREATE INDEX "shifts_roleId_startAtUtc_idx" ON "shifts"("roleId", "startAtUtc");

-- CreateIndex
CREATE INDEX "shift_assignments_shiftId_assignmentStatus_idx" ON "shift_assignments"("shiftId", "assignmentStatus");

-- CreateIndex
CREATE INDEX "shift_assignments_employeeId_assignmentStatus_idx" ON "shift_assignments"("employeeId", "assignmentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_shiftId_employeeId_key" ON "shift_assignments"("shiftId", "employeeId");

-- CreateIndex
CREATE INDEX "shift_breaks_shiftId_idx" ON "shift_breaks"("shiftId");

-- CreateIndex
CREATE INDEX "open_shift_claims_shiftId_status_idx" ON "open_shift_claims"("shiftId", "status");

-- CreateIndex
CREATE INDEX "open_shift_claims_employeeId_status_idx" ON "open_shift_claims"("employeeId", "status");

-- CreateIndex
CREATE INDEX "shift_swap_requests_organizationId_status_idx" ON "shift_swap_requests"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "custom_rule_definitions_organizationId_code_key" ON "custom_rule_definitions"("organizationId", "code");

-- CreateIndex
CREATE INDEX "custom_rule_conditions_customRuleDefinitionId_idx" ON "custom_rule_conditions"("customRuleDefinitionId");

-- CreateIndex
CREATE INDEX "rule_violations_organizationId_isResolved_idx" ON "rule_violations"("organizationId", "isResolved");

-- CreateIndex
CREATE INDEX "rule_violations_shiftId_idx" ON "rule_violations"("shiftId");

-- CreateIndex
CREATE INDEX "rule_violations_employeeId_idx" ON "rule_violations"("employeeId");

-- CreateIndex
CREATE INDEX "employee_schedule_metrics_organizationId_weekStartDate_idx" ON "employee_schedule_metrics"("organizationId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "employee_schedule_metrics_employeeId_weekStartDate_key" ON "employee_schedule_metrics"("employeeId", "weekStartDate");

-- CreateIndex
CREATE INDEX "schedule_audit_logs_organizationId_createdAt_idx" ON "schedule_audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "schedule_audit_logs_entityType_entityId_idx" ON "schedule_audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "schedule_events_organizationId_createdAt_idx" ON "schedule_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "schedule_events_aggregateType_aggregateId_idx" ON "schedule_events"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "schedule_events_eventType_createdAt_idx" ON "schedule_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "scheduling_candidates_organizationId_generatedAt_idx" ON "scheduling_candidates"("organizationId", "generatedAt");

-- CreateIndex
CREATE INDEX "scheduling_candidates_shiftId_eligibilityScore_idx" ON "scheduling_candidates"("shiftId", "eligibilityScore");

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_candidates_shiftId_employeeId_key" ON "scheduling_candidates"("shiftId", "employeeId");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_defaultLocationId_fkey" FOREIGN KEY ("defaultLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_availability_rules" ADD CONSTRAINT "employee_availability_rules_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_preferences" ADD CONSTRAINT "employee_preferences_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_shift_preferences" ADD CONSTRAINT "employee_shift_preferences_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_time_off_requests" ADD CONSTRAINT "employee_time_off_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "shift_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_breaks" ADD CONSTRAINT "shift_breaks_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_shift_claims" ADD CONSTRAINT "open_shift_claims_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_shift_claims" ADD CONSTRAINT "open_shift_claims_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_sourceAssignmentId_fkey" FOREIGN KEY ("sourceAssignmentId") REFERENCES "shift_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_requestingEmployeeId_fkey" FOREIGN KEY ("requestingEmployeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_targetEmployeeId_fkey" FOREIGN KEY ("targetEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_rule_definitions" ADD CONSTRAINT "custom_rule_definitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_rule_conditions" ADD CONSTRAINT "custom_rule_conditions_customRuleDefinitionId_fkey" FOREIGN KEY ("customRuleDefinitionId") REFERENCES "custom_rule_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_violations" ADD CONSTRAINT "rule_violations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_violations" ADD CONSTRAINT "rule_violations_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_violations" ADD CONSTRAINT "rule_violations_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_violations" ADD CONSTRAINT "rule_violations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_metrics" ADD CONSTRAINT "employee_schedule_metrics_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_metrics" ADD CONSTRAINT "employee_schedule_metrics_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_audit_logs" ADD CONSTRAINT "schedule_audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_audit_logs" ADD CONSTRAINT "schedule_audit_logs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_candidates" ADD CONSTRAINT "scheduling_candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_candidates" ADD CONSTRAINT "scheduling_candidates_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_candidates" ADD CONSTRAINT "scheduling_candidates_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
