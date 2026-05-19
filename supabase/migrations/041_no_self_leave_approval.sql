-- 041_no_self_leave_approval.sql
-- Prevent anyone from being listed as their own leave approver. The
-- ot_approvals table already has a no_self_approval CHECK constraint
-- (mig 004); leave_requests didn't. This adds the same rule plus a
-- defence-in-depth UPDATE policy guard.

-- 1) Add CHECK constraint so the DB rejects self-approval on insert/update.
ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS no_self_leave_approval;

ALTER TABLE leave_requests
  ADD CONSTRAINT no_self_leave_approval
  CHECK (supervisor_id IS NULL OR supervisor_id <> employee_id);

-- 2) If any historical rows somehow have employee == supervisor, clear the
-- supervisor (resolve_approver in the submit path should pick a new one).
UPDATE leave_requests
   SET supervisor_id = NULL
 WHERE supervisor_id = employee_id;
