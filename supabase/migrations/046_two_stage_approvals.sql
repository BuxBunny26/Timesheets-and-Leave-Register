-- 046_two_stage_approvals.sql
-- Two-stage approval workflow for OT and Leave.
--   Stage 1 (existing): supervisor approves/denies their team's request.
--                       status moves pending -> approved/denied.
--   Stage 2 (new):      after supervisor approval, the manager performs a
--                       final sign-off.
--                       final_status moves pending -> approved/denied.
--
-- This stops the duplication where both supervisor and manager see the same
-- pending item: managers now only see pending items in their own primary
-- queue (assigned approver_id = themselves), and see supervisor-approved
-- items in a separate "Final Approval" queue.
--
-- Existing 'approved' rows are backfilled as final_status='approved' so the
-- new queue starts empty rather than dumping historical items into it.

ALTER TABLE ot_approvals
  ADD COLUMN IF NOT EXISTS final_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (final_status IN ('pending','approved','denied')),
  ADD COLUMN IF NOT EXISTS final_approver_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS final_actioned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_comment TEXT;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS final_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (final_status IN ('pending','approved','denied')),
  ADD COLUMN IF NOT EXISTS final_approver_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS final_actioned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_comment TEXT;

-- Backfill: existing approved rows are treated as already finalised so the
-- final-approval queue doesn't fill up with historical items.
UPDATE ot_approvals
   SET final_status = 'approved',
       final_actioned_at = COALESCE(actioned_at, NOW())
 WHERE status = 'approved'
   AND final_status = 'pending';

UPDATE leave_requests
   SET final_status = 'approved',
       final_actioned_at = COALESCE(actioned_at, NOW())
 WHERE status = 'approved'
   AND final_status = 'pending';

-- Helpful indexes for the final-approval queue lookups
CREATE INDEX IF NOT EXISTS idx_ot_approvals_final_status
  ON ot_approvals(final_status) WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_leave_requests_final_status
  ON leave_requests(final_status) WHERE status = 'approved';
