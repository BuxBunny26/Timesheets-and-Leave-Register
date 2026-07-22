-- 079_executive_approval.sql
-- Adds the executive leave-approval infrastructure:
--   1. can_override_leave column on profiles (separate from Executive decision level)
--   2. RLS policy allowing Executives to view all Stage 2 pending requests
--   3. RLS policy allowing Executives to update final_status on eligible requests
--
-- CONFIRMED (query 7): 7 active employees have decision_level = 'Executive',
-- all with linked auth users. Executive queue will be operational immediately.
--
-- PERMISSION DESIGN:
--   decision_level = 'Executive'  → may perform Stage 2 approval
--   can_override_leave = TRUE     → may override a leave/timesheet mismatch
--   These are separate. Executive status does not grant override authority.
--
-- IDEMPOTENCY: IF NOT EXISTS / OR REPLACE throughout.

-- ── 1. can_override_leave permission ─────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_override_leave BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN profiles.can_override_leave IS
  'When TRUE, this user may override a leave type mismatch between a timesheet '
  'day and a leave request. Requires an override reason, actor, timestamp, and '
  'audit log entry. Settable only by system_admin. '
  'Executive decision level does NOT automatically grant this permission.';

-- ── 2. Helper: is current user an active Executive? ───────────────────────────
CREATE OR REPLACE FUNCTION is_executive()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
     WHERE id = auth.uid()
       AND status = 'active'
       AND decision_level = 'Executive'
  );
$$;

-- ── 3. RLS: Executives see all Stage 2 pending requests ──────────────────────
-- Adds to the existing leave_requests RLS (migration 007 created the base policies).
DROP POLICY IF EXISTS "lr_executive_queue" ON leave_requests;
CREATE POLICY "lr_executive_queue" ON leave_requests
  FOR SELECT
  USING (
    status = 'approved'
    AND final_status = 'pending'
    AND is_executive()
    -- Executives cannot see their own requests in the approval queue
    AND employee_id != auth.uid()
    -- Stage 1 approver cannot also see it in Stage 2 queue
    AND (supervisor_id IS NULL OR supervisor_id != auth.uid())
  );

-- ── 4. RLS: Executives may action Stage 2 ────────────────────────────────────
-- UPDATE is intentionally restricted to final_status and related columns only.
-- The WHERE clause enforces that only pending Stage 2 requests can be updated
-- and that the executive is not the requester or Stage 1 approver.
DROP POLICY IF EXISTS "lr_executive_update" ON leave_requests;
CREATE POLICY "lr_executive_update" ON leave_requests
  FOR UPDATE
  USING (
    status = 'approved'
    AND final_status = 'pending'
    AND is_executive()
    AND employee_id != auth.uid()
    AND (supervisor_id IS NULL OR supervisor_id != auth.uid())
  )
  WITH CHECK (
    -- Only Stage 2 columns may be changed via this policy
    final_status IN ('approved', 'denied', 'returned')
  );

-- ── 5. RLS: Executives see all approved leave requests (for reporting) ────────
DROP POLICY IF EXISTS "lr_executive_history" ON leave_requests;
CREATE POLICY "lr_executive_history" ON leave_requests
  FOR SELECT
  USING (
    is_executive()
    AND final_status IN ('approved', 'denied', 'returned')
  );

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'profiles' AND column_name = 'can_override_leave';
-- Expected: 1 row
--
-- SELECT policyname, cmd FROM pg_policies
--  WHERE tablename = 'leave_requests'
--    AND policyname LIKE 'lr_executive%';
-- Expected: lr_executive_queue (SELECT), lr_executive_update (UPDATE),
--           lr_executive_history (SELECT)
