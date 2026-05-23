-- Sprint 2: IL compliance + labor-cost meter prerequisites
-- Adds Employee.weeklyBudgetHours, dateOfBirth, weeklyRestDay

DO $$ BEGIN
  CREATE TYPE "WeeklyRestDay" AS ENUM ('FRIDAY', 'SATURDAY', 'SUNDAY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "weeklyBudgetHours" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "dateOfBirth"       DATE NULL,
  ADD COLUMN IF NOT EXISTS "weeklyRestDay"     "WeeklyRestDay" NOT NULL DEFAULT 'SATURDAY';
