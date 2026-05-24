-- Migration: Israeli Tip Law 2022 (תיקון מס' 19 לחוק שכר מינימום — חוק הטיפים)
-- Adds tip_pools and tip_distributions tables.

-- tip_pools: one row per shift-date tip collection event
CREATE TABLE "tip_pools" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "organizationId"   UUID         NOT NULL,
    "shiftDate"        DATE         NOT NULL,
    "locationId"       UUID,
    "totalAgorot"      INTEGER      NOT NULL,
    "note"             TEXT,
    "createdAt"        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "createdByUserId"  UUID,

    CONSTRAINT "tip_pools_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tip_pools_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "tip_pools_locationId_fkey"
        FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL
);

CREATE INDEX "tip_pools_organizationId_shiftDate_idx"
    ON "tip_pools" ("organizationId", "shiftDate");

CREATE INDEX "tip_pools_locationId_shiftDate_idx"
    ON "tip_pools" ("locationId", "shiftDate");

-- tip_distributions: one row per employee per tip pool (proportional share)
CREATE TABLE "tip_distributions" (
    "id"           UUID     NOT NULL DEFAULT gen_random_uuid(),
    "tipPoolId"    UUID     NOT NULL,
    "employeeId"   UUID     NOT NULL,
    "shiftMinutes" INTEGER  NOT NULL,
    "amountAgorot" INTEGER  NOT NULL,

    CONSTRAINT "tip_distributions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tip_distributions_tipPoolId_fkey"
        FOREIGN KEY ("tipPoolId") REFERENCES "tip_pools"("id") ON DELETE CASCADE,
    CONSTRAINT "tip_distributions_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "tip_distributions_tipPoolId_employeeId_key"
        UNIQUE ("tipPoolId", "employeeId")
);

CREATE INDEX "tip_distributions_employeeId_idx"
    ON "tip_distributions" ("employeeId");

-- RLS: inherit tenant isolation for tip tables
ALTER TABLE "tip_pools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tip_distributions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tip_pools_org_isolation" ON "tip_pools"
    USING (
        "organizationId"::text = current_setting('app.current_org_id', true)
    );

-- tip_distributions inherits through join; policy via tip_pools FK is sufficient,
-- but we add a direct policy using a subquery for direct reads.
CREATE POLICY "tip_distributions_org_isolation" ON "tip_distributions"
    USING (
        EXISTS (
            SELECT 1 FROM "tip_pools" tp
            WHERE tp."id" = "tipPoolId"
              AND tp."organizationId"::text = current_setting('app.current_org_id', true)
        )
    );
