-- Migration: 20260524260000_employee_pregnancy_fields
-- Adds pregnancy tracking fields to Employee for חוק עבודת נשים compliance.
-- isPregnant: boolean flag set by manager (default false, safe to add with DEFAULT)
-- pregnancyWeeks: optional week number (1-42); restriction kicks in at week 20

ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "isPregnant"      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "pregnancyWeeks"  INTEGER;
