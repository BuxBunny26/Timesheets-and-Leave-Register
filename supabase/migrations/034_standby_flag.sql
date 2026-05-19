-- 034_standby_flag.sql
-- Promote "standby" from a primary day status to an additive flag (like OT).
-- A day can now be e.g. "present + standby" or "leave + standby".

ALTER TABLE timesheet_days
  ADD COLUMN IF NOT EXISTS standby_flag BOOLEAN NOT NULL DEFAULT FALSE;

-- Migrate any existing rows where primary_status = 'standby' to:
--   standby_flag = TRUE, primary_status = 'present'
-- (The historical day was a standby duty -> treat as present for accounting purposes.)
UPDATE timesheet_days
   SET standby_flag = TRUE,
       primary_status = 'present'
 WHERE primary_status = 'standby';

-- Keep the existing CHECK constraint permissive (it already allows 'standby'
-- for backward compatibility) -- no changes needed there.
