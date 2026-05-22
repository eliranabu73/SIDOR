-- Billing — Stripe Subscriptions in ILS.
-- FREE tier has no Stripe customer; BASIC/PRO get a customer + subscription.

-- Plan enum
CREATE TYPE "BillingPlan" AS ENUM ('FREE', 'BASIC', 'PRO');

-- Columns on organizations
ALTER TABLE "organizations"
  ADD COLUMN "stripeCustomerId"     TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "plan"                 "BillingPlan" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "planRenewsAt"         TIMESTAMP(3);

-- Uniqueness on Stripe ids so a hijacked webhook can't point two orgs at one sub.
CREATE UNIQUE INDEX "organizations_stripeCustomerId_key"
  ON "organizations"("stripeCustomerId");
CREATE UNIQUE INDEX "organizations_stripeSubscriptionId_key"
  ON "organizations"("stripeSubscriptionId");
