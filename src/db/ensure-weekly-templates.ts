import type { PrismaClient } from '@prisma/client';

/**
 * TEMPORARY one-time guard: ensure the weekly_templates / weekly_template_shifts
 * tables exist in the RUNTIME database.
 *
 * Why this exists: the 20260603120000_weekly_templates migration was recorded as
 * applied but its DDL never actually ran on the production runtime DB (drift),
 * so every weekly-template write 500s with P2021 "table does not exist". The
 * Vercel build cannot reach the Supabase direct port to apply it, and the runtime
 * connects through Prisma Accelerate to a DB we can't reach directly — but the
 * backend's own Prisma client CAN. This runs the idempotent DDL through that
 * exact connection on cold-start.
 *
 * Idempotent + non-fatal: IF NOT EXISTS / guarded constraints / DROP-then-CREATE
 * policy, all wrapped so a failure never blocks app startup. REMOVE once the
 * prod table is confirmed created.
 */
const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "weekly_templates" (
     "id" UUID NOT NULL,
     "organizationId" UUID NOT NULL,
     "locationId" UUID,
     "name" TEXT NOT NULL,
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "weekly_templates_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE TABLE IF NOT EXISTS "weekly_template_shifts" (
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
   )`,
  `CREATE INDEX IF NOT EXISTS "weekly_templates_organizationId_idx" ON "weekly_templates"("organizationId")`,
  `CREATE INDEX IF NOT EXISTS "weekly_template_shifts_weeklyTemplateId_dayOfWeek_idx" ON "weekly_template_shifts"("weeklyTemplateId", "dayOfWeek")`,
  `DO $$ BEGIN
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
   END $$`,
  `ALTER TABLE "weekly_templates" ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS tenant_isolation ON "weekly_templates"`,
  `CREATE POLICY tenant_isolation ON "weekly_templates"
     FOR ALL
     USING (current_setting('app.current_org_id', true) = '*' OR "organizationId"::text = current_setting('app.current_org_id', true))
     WITH CHECK (current_setting('app.current_org_id', true) = '*' OR "organizationId"::text = current_setting('app.current_org_id', true))`,
];

let done = false;

export async function ensureWeeklyTemplatesSchema(prisma: PrismaClient): Promise<void> {
  if (done) return;
  done = true;
  try {
    for (const sql of STATEMENTS) {
      await prisma.$executeRawUnsafe(sql);
    }
    // eslint-disable-next-line no-console
    console.log('[ensureWeeklyTemplatesSchema] weekly_templates schema ensured');
  } catch (err) {
    // Never block startup — log and continue.
    // eslint-disable-next-line no-console
    console.error('[ensureWeeklyTemplatesSchema] failed (non-fatal):', err);
  }
}
