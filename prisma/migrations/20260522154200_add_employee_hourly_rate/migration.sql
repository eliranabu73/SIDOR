-- Add hourlyRate column to employees for Labor Cost dashboard.
-- Nullable so existing rows don't need a backfill; UI prompts to set it.
ALTER TABLE "employees"
  ADD COLUMN "hourlyRate" DECIMAL(10, 2);
