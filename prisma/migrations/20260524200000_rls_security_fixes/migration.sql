-- ---------------------------------------------------------------------------
-- Migration: 20260524200000_rls_security_fixes
-- Apply Row Level Security to tables that were missing tenant isolation.
-- Tables with a direct organizationId use the standard policy pattern.
-- Tables without a direct organizationId use a subquery via the parent row.
-- Safe to run multiple times (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ---------------------------------------------------------------------------

-- shift_assignments (no direct organizationId — isolate via the parent shift)
ALTER TABLE "shift_assignments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "shift_assignments";
CREATE POLICY tenant_isolation ON "shift_assignments"
  USING (
    EXISTS (
      SELECT 1 FROM "shifts" s
      WHERE s.id = "shift_assignments"."shiftId"
        AND s."organizationId"::text = current_setting('app.current_org_id', true)
    )
  );

-- employee_time_off_requests (no direct organizationId — isolate via employee)
ALTER TABLE "employee_time_off_requests" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "employee_time_off_requests";
CREATE POLICY tenant_isolation ON "employee_time_off_requests"
  USING (
    EXISTS (
      SELECT 1 FROM "employees" e
      WHERE e.id = "employee_time_off_requests"."employeeId"
        AND e."organizationId"::text = current_setting('app.current_org_id', true)
    )
  );

-- employee_availability_rules (no direct organizationId — isolate via employee)
ALTER TABLE "employee_availability_rules" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "employee_availability_rules";
CREATE POLICY tenant_isolation ON "employee_availability_rules"
  USING (
    EXISTS (
      SELECT 1 FROM "employees" e
      WHERE e.id = "employee_availability_rules"."employeeId"
        AND e."organizationId"::text = current_setting('app.current_org_id', true)
    )
  );

-- rule_violations (has direct organizationId)
ALTER TABLE "rule_violations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "rule_violations";
CREATE POLICY tenant_isolation ON "rule_violations"
  USING ("organizationId"::text = current_setting('app.current_org_id', true));

-- schedule_audit_logs (has direct organizationId)
ALTER TABLE "schedule_audit_logs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "schedule_audit_logs";
CREATE POLICY tenant_isolation ON "schedule_audit_logs"
  USING ("organizationId"::text = current_setting('app.current_org_id', true));

-- shift_swap_requests (has direct organizationId)
ALTER TABLE "shift_swap_requests" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "shift_swap_requests";
CREATE POLICY tenant_isolation ON "shift_swap_requests"
  USING ("organizationId"::text = current_setting('app.current_org_id', true));
