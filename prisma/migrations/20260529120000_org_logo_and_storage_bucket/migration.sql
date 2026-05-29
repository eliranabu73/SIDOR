-- Add logoUrl column to organizations
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;

-- NOTE: Supabase Storage bucket creation (logos bucket + RLS policies) was
-- intentionally removed from this migration because Prisma Postgres does not
-- have the storage schema. The bucket should be created manually in Supabase
-- project dashboard if/when the app is migrated back to Supabase.
