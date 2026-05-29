-- ============================================================================
-- Migration: admin_rls_bypass
--
-- The previous `withAdminContext` set `row_security = off`, which actually
-- causes Postgres to FAIL (code 42501) whenever a query would have been
-- subject to RLS — the opposite of bypass. Real BYPASSRLS requires the role
-- to have BYPASSRLS, which the Prisma connection role does not.
--
-- This migration teaches every `tenant_isolation` policy to recognise an
-- admin sentinel: when `app.current_org_id` = '*', the policy matches all
-- rows. `withAdminContext` is updated to set this sentinel.
--
-- The wildcard is safe because:
--   - Only platform-admin routes (gated by isPlatformAdmin) can invoke
--     withAdminContext.
--   - Non-admin paths use withOrgContext(orgId) which sets a UUID, never '*'.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  policy_name TEXT := 'tenant_isolation';
  org_col TEXT;
  has_org_col BOOLEAN;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
      FROM pg_policies
     WHERE policyname = policy_name
       AND schemaname = 'public'
  LOOP
    IF r.tablename = 'organizations' THEN
      org_col := 'id';
      has_org_col := TRUE;
    ELSE
      org_col := 'organizationId';
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = r.schemaname
          AND table_name = r.tablename
          AND column_name = org_col
      ) INTO has_org_col;
    END IF;

    -- Skip tables that don't have an organizationId column (they isolate
    -- via a related table, e.g. employee_availability_rules → employees).
    -- Their existing policy stays untouched; the wildcard isn't needed
    -- because admin reads on these tables go through the parent.
    IF NOT has_org_col THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY %I ON %I.%I', policy_name, r.schemaname, r.tablename);

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I USING ('
      || 'current_setting(''app.current_org_id'', true) = ''*'''
      || ' OR %I::text = current_setting(''app.current_org_id'', true)'
      || ')',
      policy_name, r.schemaname, r.tablename, org_col
    );
  END LOOP;
END$$;
