-- ============================================================================
-- Migration: employee_rate_not_null
--
-- Flips Employee.hourlyRate to NOT NULL with a DEFAULT 0 safety net.
-- The previous migration backfilled all NULL rates from laborRules.roleRates
-- (or 0 if no primary role) so this should succeed without violating the
-- constraint. The DEFAULT 0 prevents future INSERTs without a rate from failing,
-- though the application layer should always supply a real rate.
-- ============================================================================

ALTER TABLE "employees" ALTER COLUMN "hourlyRate" SET DEFAULT 0;
ALTER TABLE "employees" ALTER COLUMN "hourlyRate" SET NOT NULL;
