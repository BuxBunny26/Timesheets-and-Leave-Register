-- Allow 'manager' role to see all profiles and timesheets (same as admin_manager).
-- Previously is_admin() only included 'admin_manager' and 'system_admin', which
-- meant managers with role='manager' could only see their direct reports.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT role IN ('manager','admin_manager','system_admin') FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;
