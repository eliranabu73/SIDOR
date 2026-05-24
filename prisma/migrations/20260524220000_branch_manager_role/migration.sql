-- Migration: 20260524220000_branch_manager_role
-- Adds BRANCH_MANAGER role and scopes it to a single location.

-- 1. Add BRANCH_MANAGER value to the MembershipRole enum (PostgreSQL syntax).
--    IF NOT EXISTS prevents failure if the value was added manually before.
ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'BRANCH_MANAGER';

-- 2. Add locationId column to memberships table.
--    Only set when role = BRANCH_MANAGER; NULL for OWNER / MANAGER rows.
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "locationId" UUID;

-- 3. Add foreign key from memberships.locationId → locations.id.
--    ON DELETE SET NULL so deleting a location demotes the constraint to NULL
--    (the BRANCH_MANAGER membership still exists but loses its scope — the app
--    should surface this as a mis-configured membership).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'memberships_locationId_fkey'
  ) THEN
    ALTER TABLE "memberships"
      ADD CONSTRAINT "memberships_locationId_fkey"
      FOREIGN KEY ("locationId")
      REFERENCES "locations"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
