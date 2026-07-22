-- 089_rls_leave_policy_tables.sql
-- Enables RLS on four tables added in migrations 072–074 that were
-- missed in the original 007_rls_policies.sql sweep:
--
--   leave_types            – lookup; all authenticated users read, admins write
--   leave_policies         – lookup; all authenticated users read, admins write
--   leave_policy_rules     – lookup; all authenticated users read, admins write
--   employee_leave_policies – sensitive; employees read own, supervisors read
--                             team, admins read/write all
--
-- IDEMPOTENCY: DROP IF EXISTS + CREATE; ENABLE RLS is idempotent.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. leave_types  (lookup table — read-only for everyone, write for admins)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lt_select_all   ON leave_types;
DROP POLICY IF EXISTS lt_admin_write  ON leave_types;

CREATE POLICY lt_select_all ON leave_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY lt_admin_write ON leave_types
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════
-- 2. leave_policies  (lookup table)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE leave_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lp_select_all   ON leave_policies;
DROP POLICY IF EXISTS lp_admin_write  ON leave_policies;

CREATE POLICY lp_select_all ON leave_policies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY lp_admin_write ON leave_policies
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════
-- 3. leave_policy_rules  (lookup table)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE leave_policy_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lpr_select_all   ON leave_policy_rules;
DROP POLICY IF EXISTS lpr_admin_write  ON leave_policy_rules;

CREATE POLICY lpr_select_all ON leave_policy_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY lpr_admin_write ON leave_policy_rules
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- ═══════════════════════════════════════════════════════════════════════
-- 4. employee_leave_policies  (sensitive — policy assignment per employee)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE employee_leave_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS elp_select_own   ON employee_leave_policies;
DROP POLICY IF EXISTS elp_select_team  ON employee_leave_policies;
DROP POLICY IF EXISTS elp_select_admin ON employee_leave_policies;
DROP POLICY IF EXISTS elp_admin_write  ON employee_leave_policies;

-- Employees can read their own policy assignment
CREATE POLICY elp_select_own ON employee_leave_policies
  FOR SELECT USING (employee_id = auth.uid());

-- Supervisors/managers can read their team's assignments
CREATE POLICY elp_select_team ON employee_leave_policies
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );

-- Admins read/write all
CREATE POLICY elp_select_admin ON employee_leave_policies
  FOR SELECT USING (is_admin());

CREATE POLICY elp_admin_write ON employee_leave_policies
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
