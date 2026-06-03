-- ============================================================================
-- Migration: weekly_templates
-- Adds reusable weekly staffing templates ("define the week once").
--   weekly_templates        — org/location-scoped pattern header (RLS enabled)
--   weekly_template_shifts  — per-day shift slots + default employee ids
-- Child table is protected transitively via the parent FK cascade, matching
-- the convention in 20260523120000_enable_rls.
-- ============================================================================

-- CreateTable
CREATE TABLE "weekly_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "locationId" UUID,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_template_shifts" (
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

-- CreateIndex
CREATE INDEX "weekly_templates_organizationId_idx" ON "weekly_templates"("organizationId");

-- CreateIndex
CREATE INDEX "weekly_template_shifts_weeklyTemplateId_dayOfWeek_idx" ON "weekly_template_shifts"("weeklyTemplateId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "weekly_templates" ADD CONSTRAINT "weekly_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_templates" ADD CONSTRAINT "weekly_templates_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_template_shifts" ADD CONSTRAINT "weekly_template_shifts_weeklyTemplateId_fkey" FOREIGN KEY ("weeklyTemplateId") REFERENCES "weekly_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security — tenant isolation on the parent table.
-- Mirrors the FOR ALL + admin-wildcard + explicit WITH CHECK pattern from
-- 20260530000000_roles_rls_allow_member_writes so member writes (POST/PUT/
-- DELETE by MANAGER / BRANCH_MANAGER) don't hit a 42501 → 403, and the
-- withAdminContext() '*' sentinel keeps working.
ALTER TABLE "weekly_templates" ENABLE ROW LEVEL SECURITY;

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
