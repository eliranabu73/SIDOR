-- WhatsApp Cloud API delivery tracking.
-- One row per outbound message attempt; updated by API response + webhook
-- status receipts (sent → delivered → read, or failed).
CREATE TABLE "message_deliveries" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "organizationId"   UUID         NOT NULL,
    "employeeId"       UUID         NOT NULL,
    "channel"          TEXT         NOT NULL,
    "templateName"     TEXT,
    "payload"          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    "status"           TEXT         NOT NULL DEFAULT 'queued',
    "wabaMessageId"    TEXT,
    "error"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_deliveries_organizationId_createdAt_idx"
    ON "message_deliveries"("organizationId", "createdAt");
CREATE INDEX "message_deliveries_employeeId_createdAt_idx"
    ON "message_deliveries"("employeeId", "createdAt");
CREATE INDEX "message_deliveries_wabaMessageId_idx"
    ON "message_deliveries"("wabaMessageId");

ALTER TABLE "message_deliveries"
    ADD CONSTRAINT "message_deliveries_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_deliveries"
    ADD CONSTRAINT "message_deliveries_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
