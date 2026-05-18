-- ============================================================
-- 018: OT TEAM VISIBILITY + SUPERVISOR SCOPING
-- ============================================================
-- Adds a missing RLS policy so supervisors/managers can SELECT
-- ot_approvals for any employee in their team (recursive).
-- Also fixes the nadhira@wearcheckrs.com profile to system_admin
-- if she already has an auth account.
-- ============================================================

-- Add the missing team SELECT policy on ot_approvals
DROP POLICY IF EXISTS "ot_select_team" ON ot_approvals;
CREATE POLICY "ot_select_team" ON ot_approvals
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );

-- Supervisors can also see OT they need to action (already covered by
-- ot_select_own via approver_id, but this ensures visibility before
-- an approver is assigned).

-- ============================================================
-- Set nadhira@wearcheckrs.com as system_admin
-- (run this AFTER her auth account exists in Supabase)
-- ============================================================
UPDATE profiles
SET role = 'system_admin'
WHERE email ILIKE 'nadhira@wearcheckrs.com';
