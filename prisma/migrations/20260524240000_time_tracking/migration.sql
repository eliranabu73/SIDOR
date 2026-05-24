-- Migration: Time Tracking — שעון נוכחות
-- Adds time_entries table for employee clock-in / clock-out.

CREATE TABLE "time_entries" (
    "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
    "organizationId"    UUID         NOT NULL,
    "employeeId"        UUID         NOT NULL,
    "shiftAssignmentId" UUID,
    "clockInAt"         TIMESTAMPTZ  NOT NULL,
    "clockOutAt"        TIMESTAMPTZ,
    "clockInLat"        DOUBLE PRECISION,
    "clockInLng"        DOUBLE PRECISION,
    "clockOutLat"       DOUBLE PRECISION,
    "clockOutLng"       DOUBLE PRECISION,
    "note"              TEXT,
    "source"            TEXT         NOT NULL DEFAULT 'employee',
    "createdAt"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "time_entries_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "time_entries_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
    -- shiftAssignmentId is intentionally not a FK — assignments can be deleted
    -- independently; we keep the reference for informational purposes only.
);

CREATE INDEX "time_entries_organizationId_employeeId_idx"
    ON "time_entries" ("organizationId", "employeeId");

CREATE INDEX "time_entries_organizationId_clockInAt_idx"
    ON "time_entries" ("organizationId", "clockInAt");

-- Index for fast "find open entry" queries (clockOutAt IS NULL)
CREATE INDEX "time_entries_open_entry_idx"
    ON "time_entries" ("organizationId", "employeeId")
    WHERE "clockOutAt" IS NULL;

-- RLS: tenant isolation
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_entries_org_isolation" ON "time_entries"
    USING (
        "organizationId"::text = current_setting('app.current_org_id', true)
    );
