-- ============================================================================
-- Migration: enable_rls
-- Apply manually with `npx prisma migrate deploy` after testing locally.
--
-- Enables PostgreSQL Row Level Security on all org-scoped tables so that
-- every DB session is restricted to one tenant.
--
-- Policy mechanism:
--   Application code must run `SET LOCAL app.current_org_id = '<uuid>'`
--   at the start of each transaction (see src/db/prisma.ts withOrgContext).
--
-- Tables covered: 17
--   organizations, memberships, locations, departments, roles, employees,
--   schedules, shift_templates, shifts, shift_swap_requests,
--   custom_rule_definitions, rule_violations, schedule_audit_logs,
--   schedule_events, employee_schedule_metrics, scheduling_candidates,
--   message_deliveries
--
-- Child tables (shift_assignments, shift_breaks, open_shift_claims,
-- employee_roles, employee_availability_rules, employee_preferences,
-- employee_shift_preferences, employee_time_off_requests,
-- custom_rule_conditions) are protected transitively via their parent FK
-- cascade. Add explicit RLS on them if direct-table queries are introduced.
--
-- IMPORTANT: After enabling RLS, Supabase service-role / Prisma connections
-- that bypass JWT must be allowed through by either:
--   a) Using the `service_role` Postgres role (bypasses RLS by default), or
--   b) Calling `SET LOCAL app.current_org_id` before each query.
-- The Prisma connection string should use the `service_role` key so that
-- migrations and admin tasks bypass RLS. Application connections that enforce
-- per-org isolation must use withOrgContext().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- organizations — policy uses `id` (this IS the tenant root)
-- ---------------------------------------------------------------------------
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "organizations"
  USING (id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "memberships"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------------
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "locations"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------
ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "departments"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "roles"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- employees
-- ---------------------------------------------------------------------------
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "employees"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- schedules
-- ---------------------------------------------------------------------------
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "schedules"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- shift_templates
-- ---------------------------------------------------------------------------
ALTER TABLE "shift_templates" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "shift_templates"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- shifts
-- ---------------------------------------------------------------------------
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "shifts"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- shift_swap_requests
-- ---------------------------------------------------------------------------
ALTER TABLE "shift_swap_requests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "shift_swap_requests"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- custom_rule_definitions
-- ---------------------------------------------------------------------------
ALTER TABLE "custom_rule_definitions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "custom_rule_definitions"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- rule_violations
-- ---------------------------------------------------------------------------
ALTER TABLE "rule_violations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "rule_violations"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- schedule_audit_logs
-- ---------------------------------------------------------------------------
ALTER TABLE "schedule_audit_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "schedule_audit_logs"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- schedule_events
-- ---------------------------------------------------------------------------
ALTER TABLE "schedule_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "schedule_events"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- employee_schedule_metrics
-- ---------------------------------------------------------------------------
ALTER TABLE "employee_schedule_metrics" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "employee_schedule_metrics"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- scheduling_candidates
-- ---------------------------------------------------------------------------
ALTER TABLE "scheduling_candidates" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "scheduling_candidates"
  USING (organization_id::text = current_setting('app.current_org_id', true));

-- ---------------------------------------------------------------------------
-- message_deliveries
-- ---------------------------------------------------------------------------
ALTER TABLE "message_deliveries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "message_deliveries"
  USING (organization_id::text = current_setting('app.current_org_id', true));
