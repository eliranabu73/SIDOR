-- Migration: add employee shift-confirmation tracking columns
-- Sprint: WhatsApp confirmation loop

ALTER TABLE "shift_assignments"
  ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "confirmedVia" TEXT;

-- Index: manager dashboard confirmation status query
CREATE INDEX IF NOT EXISTS "shift_assignments_employeeId_confirmedAt_idx"
  ON "shift_assignments" ("employeeId", "confirmedAt");
