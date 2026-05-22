-- Supabase Custom Access Token Hook
-- Apply via: Dashboard → Auth → Hooks → Custom Access Token → "public.sidor_jwt_hook".
-- Run THIS file in the SQL editor first, then register the hook in the dashboard UI.
--
-- Injects app_metadata.organization_id + app_metadata.role into the JWT issued
-- by Supabase Auth, sourced from the public.memberships table. MVP picks the
-- oldest membership per user (single-org-per-user). v0.3 will support a
-- user-selectable active org via a session table or x-org header.

CREATE OR REPLACE FUNCTION public.sidor_jwt_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  m       record;
  claims  jsonb;
  app_md  jsonb;
BEGIN
  claims := event->'claims';
  app_md := COALESCE(claims->'app_metadata', '{}'::jsonb);

  SELECT m1."organizationId", m1.role::text
    INTO m
    FROM public.memberships m1
   WHERE m1."userId" = (event->>'user_id')::uuid
   ORDER BY m1."createdAt" ASC
   LIMIT 1;

  IF m."organizationId" IS NOT NULL THEN
    app_md := app_md
      || jsonb_build_object(
        'organization_id', m."organizationId"::text,
        'role',            m.role
      );
    claims := jsonb_set(claims, '{app_metadata}', app_md);
  END IF;

  RETURN jsonb_build_object('claims', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sidor_jwt_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.sidor_jwt_hook(jsonb) FROM public, anon, authenticated;

-- Allow the auth admin role to read memberships for hook execution.
GRANT SELECT ON public.memberships TO supabase_auth_admin;
