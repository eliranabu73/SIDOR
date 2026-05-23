-- Admin panel feature additions (WS-admin-extended)
-- Adds soft-delete + feature-flag columns to organizations, deactivation
-- marker on memberships, and extends BillingPlan with an ENTERPRISE tier.

-- Extend BillingPlan enum
ALTER TYPE "BillingPlan" ADD VALUE IF NOT EXISTS 'ENTERPRISE';

-- Organizations: soft-delete + feature flags
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "deletedAt"    TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS "featureFlags" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "idx_orgs_deleted_at"
  ON "organizations"("deletedAt")
  WHERE "deletedAt" IS NOT NULL;

-- Memberships: per-user-per-org deactivation marker
ALTER TABLE "memberships"
  ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "idx_memberships_deactivated_at"
  ON "memberships"("deactivatedAt")
  WHERE "deactivatedAt" IS NOT NULL;
