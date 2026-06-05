-- Idempotent re-application of the 20260603120000_weekly_templates migration.
-- The migration was recorded in _prisma_migrations as applied, but the tables
-- never actually got created on prod (drift). This recreates them safely:
-- IF NOT EXISTS for tables/indexes, guarded ADD CONSTRAINT for FKs, and
-- DROP POLICY IF EXISTS before CREATE POLICY for the RLS policy.

CREATE TABLE IF NOT EXISTS "weekly_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locationId" UUID,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "weekly_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "weekly_template_shifts" (
    "id" UUID NOT NULL,
    "weeklyTemplateId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startLocalTime" TEXT NOT NULL,
    "endLocalTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "roleId" UUID,
    "requiredEmployeeCount" INTEGER NOT NULL DEFAULT 1,
    "defaultEmployeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "weekly_template_shifts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "weekly_templates_organizationId_idx" ON "weekly_templates"("organizationId");
CREATE INDEX IF NOT EXISTS "weekly_template_shifts_weeklyTemplateId_dayOfWeek_idx" ON "weekly_template_shifts"("weeklyTemplateId", "dayOfWeek");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_templates_organizationId_fkey') THEN
    ALTER TABLE "weekly_templates" ADD CONSTRAINT "weekly_templates_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_templates_locationId_fkey') THEN
    ALTER TABLE "weekly_templates" ADD CONSTRAINT "weekly_templates_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_template_shifts_weeklyTemplateId_fkey') THEN
    ALTER TABLE "weekly_template_shifts" ADD CONSTRAINT "weekly_template_shifts_weeklyTemplateId_fkey"
      FOREIGN KEY ("weeklyTemplateId") REFERENCES "weekly_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "weekly_templates" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "weekly_templates";
CREATE POLICY tenant_isolation ON "weekly_templates"
  FOR ALL
  USING (
    current_setting('app.current_org_id', true) = '*'
    OR "organizationId"::text = current_setting('app.current_org_id', true)
  )
  WITH CHECK (
    current_setting('app.current_org_id', true) = '*'
    OR "organizationId"::text = current_setting('app.current_org_id', true)
  );
