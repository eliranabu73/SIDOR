-- Migration: 20260524210000_employee_israeli_id
-- Add optional israeliId (תעודת זהות) to employees for Hilan payroll export.
ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "israeliId" VARCHAR(20) NULL;
