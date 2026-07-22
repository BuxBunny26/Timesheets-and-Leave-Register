-- 080_standby_cleanup.sql
-- Removes 'standby' from the timesheet_days.primary_status CHECK constraint.
--
-- CONFIRMED SAFE (query 5): standby_count = 0.
-- No existing rows use primary_status = 'standby'.
--
-- Standby is a separate flag (standby_flag BOOLEAN), not a primary status.
-- The primary statuses are: present, leave, sick, awol, public_holiday.
--
-- IDEMPOTENCY: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.

-- Drop the existing constraint (name confirmed from migration 004)
ALTER TABLE timesheet_days
  DROP CONSTRAINT IF EXISTS timesheet_days_primary_status_check;

-- Re-add without 'standby'
ALTER TABLE timesheet_days
  ADD CONSTRAINT timesheet_days_primary_status_check
  CHECK (primary_status IN ('present', 'leave', 'sick', 'awol', 'public_holiday'));

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'timesheet_days'::regclass
--    AND conname = 'timesheet_days_primary_status_check';
-- Expected: CHECK (primary_status IN ('present','leave','sick','awol','public_holiday'))
-- 'standby' must NOT appear.
