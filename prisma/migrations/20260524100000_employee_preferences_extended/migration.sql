-- Extend employee_preferences with manager-editable constraints used by the
-- ConstraintsForm UI. All new columns are nullable / default-safe so the
-- migration is idempotent and re-running is a no-op.

ALTER TABLE "employee_preferences"
  ADD COLUMN IF NOT EXISTS "preferredShiftLength" INTEGER NULL;

ALTER TABLE "employee_preferences"
  ADD COLUMN IF NOT EXISTS "noWorkAfter" VARCHAR(8) NULL;

ALTER TABLE "employee_preferences"
  ADD COLUMN IF NOT EXISTS "noWorkBefore" VARCHAR(8) NULL;

ALTER TABLE "employee_preferences"
  ADD COLUMN IF NOT EXISTS "avoidWeekends" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "employee_preferences"
  ADD COLUMN IF NOT EXISTS "avoidNightShifts" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "employee_preferences"
  ADD COLUMN IF NOT EXISTS "notes" TEXT NULL;
