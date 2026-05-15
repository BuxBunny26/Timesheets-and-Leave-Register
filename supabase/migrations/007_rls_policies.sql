-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: is current user admin or system admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT role IN ('admin_manager','system_admin') FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: is employee a direct report of current user?
CREATE OR REPLACE FUNCTION is_direct_report(employee_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = employee_id AND supervisor_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: is employee in current user's extended team (reports of reports)?
CREATE OR REPLACE FUNCTION is_in_team(employee_id UUID)
RETURNS BOOLEAN AS $$
  WITH RECURSIVE team AS (
    SELECT id FROM profiles WHERE supervisor_id = auth.uid()
    UNION ALL
    SELECT p.id FROM profiles p INNER JOIN team t ON p.supervisor_id = t.id
  )
  SELECT EXISTS (SELECT 1 FROM team WHERE id = employee_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =====================
-- PROFILES RLS
-- =====================

-- Everyone can read their own profile
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Supervisors/managers can read their team's profiles
CREATE POLICY "profiles_select_team" ON profiles
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(id)
  );

-- Admin/system admin can read all
CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT USING (is_admin());

-- Users can update their own profile (limited fields enforced by app)
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Admin can update any profile
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (is_admin());

-- Only system admin can insert profiles directly (normally via auth trigger)
CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT WITH CHECK (is_admin() OR id = auth.uid());

-- =====================
-- TIMESHEET WEEKS RLS
-- =====================
CREATE POLICY "tw_select_own" ON timesheet_weeks
  FOR SELECT USING (employee_id = auth.uid());

CREATE POLICY "tw_select_team" ON timesheet_weeks
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );

CREATE POLICY "tw_select_admin" ON timesheet_weeks
  FOR SELECT USING (is_admin());

CREATE POLICY "tw_insert_own" ON timesheet_weeks
  FOR INSERT WITH CHECK (employee_id = auth.uid());

CREATE POLICY "tw_update_own" ON timesheet_weeks
  FOR UPDATE USING (employee_id = auth.uid());

CREATE POLICY "tw_update_supervisor" ON timesheet_weeks
  FOR UPDATE USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );

-- =====================
-- TIMESHEET DAYS RLS
-- =====================
CREATE POLICY "td_select_own" ON timesheet_days
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM timesheet_weeks tw
            WHERE tw.id = timesheet_week_id AND tw.employee_id = auth.uid())
  );

CREATE POLICY "td_select_team" ON timesheet_days
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND EXISTS (
      SELECT 1 FROM timesheet_weeks tw
      WHERE tw.id = timesheet_week_id AND is_in_team(tw.employee_id)
    )
  );

CREATE POLICY "td_insert_own" ON timesheet_days
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM timesheet_weeks tw
            WHERE tw.id = timesheet_week_id AND tw.employee_id = auth.uid())
  );

CREATE POLICY "td_update_own" ON timesheet_days
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM timesheet_weeks tw
            WHERE tw.id = timesheet_week_id AND tw.employee_id = auth.uid()
            AND tw.status = 'draft')
  );

-- =====================
-- OT APPROVALS RLS
-- =====================
CREATE POLICY "ot_select_own" ON ot_approvals
  FOR SELECT USING (employee_id = auth.uid() OR approver_id = auth.uid());

CREATE POLICY "ot_select_admin" ON ot_approvals
  FOR SELECT USING (is_admin());

CREATE POLICY "ot_insert_own" ON ot_approvals
  FOR INSERT WITH CHECK (employee_id = auth.uid());

CREATE POLICY "ot_update_approver" ON ot_approvals
  FOR UPDATE USING (approver_id = auth.uid() OR is_admin());

-- =====================
-- LEAVE REQUESTS RLS
-- =====================
CREATE POLICY "lr_select_own" ON leave_requests
  FOR SELECT USING (employee_id = auth.uid());

CREATE POLICY "lr_select_supervisor" ON leave_requests
  FOR SELECT USING (supervisor_id = auth.uid() OR is_admin());

CREATE POLICY "lr_select_team" ON leave_requests
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager')
    AND is_in_team(employee_id)
  );

CREATE POLICY "lr_insert_own" ON leave_requests
  FOR INSERT WITH CHECK (employee_id = auth.uid());

CREATE POLICY "lr_update_own" ON leave_requests
  FOR UPDATE USING (
    employee_id = auth.uid()
    AND status = 'pending'
  );

CREATE POLICY "lr_update_supervisor" ON leave_requests
  FOR UPDATE USING (supervisor_id = auth.uid() OR is_admin());

-- =====================
-- NOTIFICATIONS RLS
-- =====================
CREATE POLICY "notif_select_own" ON notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "notif_update_own" ON notifications
  FOR UPDATE USING (recipient_id = auth.uid());

CREATE POLICY "notif_insert_service" ON notifications
  FOR INSERT WITH CHECK (is_admin());

-- =====================
-- ATTACHMENTS RLS
-- =====================
CREATE POLICY "attach_select_own" ON attachments
  FOR SELECT USING (uploaded_by = auth.uid() OR is_admin());

CREATE POLICY "attach_insert_own" ON attachments
  FOR INSERT WITH CHECK (uploaded_by = auth.uid());

-- =====================
-- TIMESHEET VERIFICATIONS RLS
-- =====================
CREATE POLICY "tv_select_own" ON timesheet_verifications
  FOR SELECT USING (employee_id = auth.uid() OR is_admin());

CREATE POLICY "tv_update_own" ON timesheet_verifications
  FOR UPDATE USING (employee_id = auth.uid());

CREATE POLICY "tv_insert_own" ON timesheet_verifications
  FOR INSERT WITH CHECK (employee_id = auth.uid());

-- =====================
-- AUDIT LOG RLS
-- =====================
CREATE POLICY "audit_select_admin" ON audit_log
  FOR SELECT USING (is_admin());

CREATE POLICY "audit_insert_any" ON audit_log
  FOR INSERT WITH CHECK (TRUE);

-- =====================
-- SKIP-UP RULE FUNCTION
-- =====================
-- When a supervisor tries to approve their own submission, route to their supervisor
CREATE OR REPLACE FUNCTION resolve_approver(submitted_by_id UUID, intended_approver_id UUID)
RETURNS UUID AS $$
DECLARE
  skip_approver_id UUID;
BEGIN
  IF submitted_by_id = intended_approver_id THEN
    SELECT supervisor_id INTO skip_approver_id
    FROM profiles
    WHERE id = intended_approver_id;
    RETURN skip_approver_id;
  END IF;
  RETURN intended_approver_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
