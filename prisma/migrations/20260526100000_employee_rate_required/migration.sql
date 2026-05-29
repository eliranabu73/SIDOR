-- ============================================================================
-- Migration: employee_rate_required
--
-- Adds Employee.hireDate (nullable) for tenure tracking, and EmployeeRateHistory
-- audit table for wage-change history.
--
-- Also backfills Employee.hourlyRate from the legacy laborRules.roleRates JSON
-- map for any employees that still have a NULL rate. After this migration runs,
-- 20260526100100_employee_rate_not_null flips hourlyRate to NOT NULL.
-- ============================================================================

-- 1. Add hireDate column
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "hireDate" DATE;

-- 2. Backfill hourlyRate from Organization.laborRulesJsonb->'roleRates'->{primaryRoleName}
--    employee_roles keys by roleId (UUID), so we join roles to fetch the name.
UPDATE "employees" e
SET "hourlyRate" = COALESCE(
  (
    SELECT (org."laborRulesJsonb"->'roleRates'->>r.name)::numeric
    FROM "employee_roles" er
    JOIN "roles" r ON r.id = er."roleId"
    JOIN "organizations" org ON org.id = e."organizationId"
    WHERE er."employeeId" = e.id
      AND er."isPrimary" = true
    LIMIT 1
  ),
  e."hourlyRate"
)
WHERE e."hourlyRate" IS NULL;

-- 3. Safety net: any still-NULL rates → 0. The owner will see these as red rows
--    in the SetupChecklist and be prompted to fix them.
UPDATE "employees" SET "hourlyRate" = 0 WHERE "hourlyRate" IS NULL;

-- 4. EmployeeRateHistory audit table
CREATE TABLE IF NOT EXISTS "employee_rate_history" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId"      UUID NOT NULL,
  "rateAgorot"      INTEGER NOT NULL,
  "effectiveFrom"   DATE NOT NULL,
  "reason"          TEXT,
  "changedByUserId" UUID,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_rate_history_employeeId_fkey'
  ) THEN
    ALTER TABLE "employee_rate_history"
      ADD CONSTRAINT "employee_rate_history_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "employee_rate_history_employeeId_effectiveFrom_idx"
  ON "employee_rate_history" ("employeeId", "effectiveFrom" DESC);

-- 5. Seed history rows for the current rate so the audit trail isn't empty
INSERT INTO "employee_rate_history" ("employeeId", "rateAgorot", "effectiveFrom", "reason")
SELECT id, ROUND(("hourlyRate" * 100))::int, COALESCE("hireDate", "createdAt"::date), 'Initial rate (backfill)'
FROM "employees"
WHERE NOT EXISTS (
  SELECT 1 FROM "employee_rate_history" h WHERE h."employeeId" = "employees".id
);
