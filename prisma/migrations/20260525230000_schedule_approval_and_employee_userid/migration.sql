-- Migration: 20260525230000_schedule_approval_and_employee_userid
-- 1. Add PENDING_APPROVAL + APPROVED to ScheduleStatus enum.
-- 2. Add approval/submission tracking fields to schedules.
-- 3. Add employees.userId for managers promoted from employee rows.

-- ScheduleStatus new values (must be in separate statements; cannot be wrapped in a tx)
ALTER TYPE "ScheduleStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "ScheduleStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

-- Approval/submission tracking on schedules
ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "submittedByUserId" UUID;
ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "approvedByUserId" UUID;
ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "rejectionNote" TEXT;

-- Link employees to a Supabase auth user when promoted to a manager role.
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "userId" UUID;
CREATE INDEX IF NOT EXISTS "employees_userId_idx" ON "employees"("userId");
