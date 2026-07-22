-- 088_security_hardening.sql
-- Addresses security gaps found in audit:
--
--   1. leave_balances — table was never created via a tracked migration.
--      Creates the table (IF NOT EXISTS) then enables RLS with proper policies.
--
--   2. profiles_update_own allows employees to update sensitive columns
--      (role, status, supervisor_id, department_id, etc.) by calling the
--      REST API directly.  Replaces the policy with one that pins those
--      columns to their current DB values.
--
--   3. cert_modify_own used FOR ALL — restricts employees to UPDATE only.
--
-- IDEMPOTENCY: CREATE IF NOT EXISTS + DROP IF EXISTS + ADD COLUMN IF NOT EXISTS.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. leave_balances — create table + RLS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS leave_balances (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leave_type        TEXT,
  year              INTEGER,
  total_days        NUMERIC     NOT NULL DEFAULT 0,
  used_days         NUMERIC     NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columns added in migration 077 (safe to re-run with IF NOT EXISTS)
ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS leave_type_id UUID REFERENCES leave_types(id);
ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS cycle_start DATE;
ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS cycle_end   DATE;

-- Unique constraint (original text-based key)
ALTER TABLE leave_balances
  DROP CONSTRAINT IF EXISTS leave_balances_employee_type_year_unique;
ALTER TABLE leave_balances
  ADD CONSTRAINT leave_balances_employee_type_year_unique
  UNIQUE (employee_id, leave_type, year);

-- Keep updated_at current
DROP TRIGGER IF EXISTS update_leave_balances_updated_at ON leave_balances;
CREATE TRIGGER update_leave_balances_updated_at
  BEFORE UPDATE ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Now enable RLS
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lb_select_own   ON leave_balances;
DROP POLICY IF EXISTS lb_select_team  ON leave_balances;
DROP POLICY IF EXISTS lb_select_admin ON leave_balances;
DROP POLICY IF EXISTS lb_modify_admin ON leave_balances;

-- Employees see their own balances
CREATE POLICY lb_select_own ON leave_balances
  FOR SELECT USING (employee_id = auth.uid());

-- Supervisors/managers see their team's balances
CREATE POLICY lb_select_team ON leave_balances
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );

-- Admins see everything and can INSERT/UPDATE/DELETE
CREATE POLICY lb_select_admin ON leave_balances
  FOR SELECT USING (is_admin());

CREATE POLICY lb_modify_admin ON leave_balances
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Note: the sync_leave_balance() trigger is SECURITY DEFINER so it
-- bypasses RLS when writing balance rows — no additional policy needed
-- for trigger-driven inserts/updates.

-- ═══════════════════════════════════════════════════════════════════════
-- 2. profiles_update_own — prevent self-escalation
-- ═══════════════════════════════════════════════════════════════════════
-- Helper: read the caller's current sensitive profile fields without
-- going through RLS (SECURITY DEFINER + postgres owner = BYPASSRLS).
CREATE OR REPLACE FUNCTION public.get_own_profile_snapshot()
RETURNS TABLE (
  p_role             TEXT,
  p_status           TEXT,
  p_employee_code    TEXT,
  p_supervisor_id    UUID,
  p_payment_centre_id UUID,
  p_department_id    UUID,
  p_division_id      UUID,
  p_site_id          UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role, status, employee_code, supervisor_id,
         payment_centre_id, department_id, division_id, site_id
  FROM   profiles
  WHERE  id = auth.uid()
  LIMIT  1;
$$;
REVOKE EXECUTE ON FUNCTION public.get_own_profile_snapshot() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_own_profile_snapshot() TO authenticated;

-- Replace the permissive update-own policy with one that pins all
-- admin-controlled columns to their current DB values.
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  USING  (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- The values below must stay identical to what is already in the DB.
    -- Any attempt to change role, status, employee_code, or org-placement
    -- fields via a direct API call will be rejected.
    AND role              = (SELECT p_role              FROM get_own_profile_snapshot())
    AND status            = (SELECT p_status            FROM get_own_profile_snapshot())
    AND employee_code     IS NOT DISTINCT FROM (SELECT p_employee_code    FROM get_own_profile_snapshot())
    AND supervisor_id     IS NOT DISTINCT FROM (SELECT p_supervisor_id    FROM get_own_profile_snapshot())
    AND payment_centre_id IS NOT DISTINCT FROM (SELECT p_payment_centre_id FROM get_own_profile_snapshot())
    AND department_id     IS NOT DISTINCT FROM (SELECT p_department_id    FROM get_own_profile_snapshot())
    AND division_id       IS NOT DISTINCT FROM (SELECT p_division_id      FROM get_own_profile_snapshot())
    AND site_id           IS NOT DISTINCT FROM (SELECT p_site_id          FROM get_own_profile_snapshot())
  );

-- Admin update policy is unchanged — admins can update everything.
-- profiles_update_admin covers managers/admins modifying any profile.

-- ═══════════════════════════════════════════════════════════════════════
-- 3. cert_modify_own — restrict employees to UPDATE only
-- ═══════════════════════════════════════════════════════════════════════
-- The original FOR ALL policy let employees INSERT or DELETE their own
-- certification rows.  Certifications are admin-managed records; employees
-- should only be able to read theirs (SELECT covered by cert_select_own)
-- and make minor self-service updates.  INSERT and DELETE remain admin-only.

DROP POLICY IF EXISTS cert_modify_own ON employee_certifications;

CREATE POLICY cert_modify_own ON employee_certifications
  FOR UPDATE
  USING  (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid());
