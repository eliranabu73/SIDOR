-- ============================================================================
-- Migration: 20260530000000_roles_rls_allow_member_writes
--
-- Problem: PATCH /v1/roles/:id and DELETE /v1/roles/:id were returning 403
-- for authenticated non-owner members (MANAGER, BRANCH_MANAGER).
--
-- Root cause: PostgreSQL RLS applies both a USING check (to find rows) and a
-- WITH CHECK (to validate the modified row). When the existing tenant_isolation
-- policy used only USING (no explicit WITH CHECK), the implicit WITH CHECK
-- derived from USING was evaluated against the connection's current GUC. If
-- the GUC was not set correctly (e.g. Prisma Accelerate routing edge case) the
-- WITH CHECK would fail with error 42501 (insufficient_privilege), which the
-- backend's global error handler mapped to 403.
--
-- Fix: Recreate the tenant_isolation policies on "roles" and "locations" with
-- explicit WITH CHECK clauses that are identical to the USING expression.
-- This makes the intent unambiguous and prevents any implicit-check mismatch.
-- Both tables are touched because they share the same update/delete pattern.
--
-- The wildcard sentinel ('*') from the admin_rls_bypass migration is preserved
-- so that withAdminContext() continues to work.
-- ============================================================================

-- roles -----------------------------------------------------------------------

DROP POLICY IF EXISTS tenant_isolation ON "roles";

CREATE POLICY tenant_isolation ON "roles"
  FOR ALL
  USING (
    current_setting('app.current_org_id', true) = '*'
    OR "organizationId"::text = current_setting('app.current_org_id', true)
  )
  WITH CHECK (
    current_setting('app.current_org_id', true) = '*'
    OR "organizationId"::text = current_setting('app.current_org_id', true)
  );

-- locations -------------------------------------------------------------------

DROP POLICY IF EXISTS tenant_isolation ON "locations";

CREATE POLICY tenant_isolation ON "locations"
  FOR ALL
  USING (
    current_setting('app.current_org_id', true) = '*'
    OR "organizationId"::text = current_setting('app.current_org_id', true)
  )
  WITH CHECK (
    current_setting('app.current_org_id', true) = '*'
    OR "organizationId"::text = current_setting('app.current_org_id', true)
  );
