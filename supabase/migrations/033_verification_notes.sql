-- 033_verification_notes.sql
-- Add a free-text notes field so employees can record context when verifying
-- their monthly OT / leave totals.

ALTER TABLE timesheet_verifications
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_verifications_period
  ON timesheet_verifications (period_month, employee_id);
