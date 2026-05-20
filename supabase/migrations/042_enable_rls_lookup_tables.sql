-- 042_enable_rls_lookup_tables.sql
-- Supabase security advisor flagged these public tables for having
-- Row-Level Security disabled. They are lookup/reference tables that the
-- whole app reads, so we enable RLS and grant read access to any
-- authenticated user. Writes are restricted to admins only (handled via
-- the existing is_admin() helper from 007_rls_policies.sql).

ALTER TABLE divisions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

-- divisions ------------------------------------------------------------
DROP POLICY IF EXISTS divisions_select_all   ON divisions;
DROP POLICY IF EXISTS divisions_admin_write  ON divisions;

CREATE POLICY divisions_select_all ON divisions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY divisions_admin_write ON divisions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- departments ----------------------------------------------------------
DROP POLICY IF EXISTS departments_select_all  ON departments;
DROP POLICY IF EXISTS departments_admin_write ON departments;

CREATE POLICY departments_select_all ON departments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY departments_admin_write ON departments
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- payment_centres ------------------------------------------------------
DROP POLICY IF EXISTS payment_centres_select_all  ON payment_centres;
DROP POLICY IF EXISTS payment_centres_admin_write ON payment_centres;

CREATE POLICY payment_centres_select_all ON payment_centres
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY payment_centres_admin_write ON payment_centres
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- sites ----------------------------------------------------------------
DROP POLICY IF EXISTS sites_select_all  ON sites;
DROP POLICY IF EXISTS sites_admin_write ON sites;

CREATE POLICY sites_select_all ON sites
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY sites_admin_write ON sites
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- public_holidays ------------------------------------------------------
DROP POLICY IF EXISTS public_holidays_select_all  ON public_holidays;
DROP POLICY IF EXISTS public_holidays_admin_write ON public_holidays;

CREATE POLICY public_holidays_select_all ON public_holidays
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY public_holidays_admin_write ON public_holidays
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
