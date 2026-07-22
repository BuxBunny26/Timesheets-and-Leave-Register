-- 083_validate_constraints.sql
-- Validates the NOT VALID constraints added in migration 076.
-- Must be run AFTER confirming that all existing timesheet_days rows satisfy
-- the leave_type_id invariant.
--
-- Run this ONLY after:
--   1. Application code is updated to send leave_type_id in the upsert.
--   2. All existing 'leave' days have been backfilled with leave_type_id.
--   3. The verification query below returns 0.
--
-- PREREQUISITE QUERY (run before this migration):
--   SELECT COUNT(*) AS violations
--     FROM timesheet_days
--    WHERE primary_status = 'leave' AND leave_type_id IS NULL;
--   Expected: 0
--
-- If the count is > 0, do NOT run this migration. Backfill first:
--   UPDATE timesheet_days td
--   SET leave_type_id = (
--     SELECT lr.leave_type_id
--       FROM leave_requests lr
--      WHERE lr.id = td.leave_request_id
--        AND lr.leave_type_id IS NOT NULL
--      LIMIT 1
--   )
--   WHERE td.primary_status = 'leave'
--     AND td.leave_type_id IS NULL
--     AND td.leave_request_id IS NOT NULL;
-- Then investigate any remaining rows manually.

-- ── Validate constraint: leave days must have leave_type_id ───────────────────
ALTER TABLE timesheet_days
  VALIDATE CONSTRAINT chk_leave_type_required_for_leave;

-- ── Validate constraint: non-leave days must not have leave_type_id ───────────
ALTER TABLE timesheet_days
  VALIDATE CONSTRAINT chk_leave_type_null_for_non_leave;

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT conname, convalidated FROM pg_constraint
--  WHERE conrelid = 'timesheet_days'::regclass
--    AND conname IN ('chk_leave_type_required_for_leave',
--                    'chk_leave_type_null_for_non_leave');
-- Expected: both rows have convalidated = true
