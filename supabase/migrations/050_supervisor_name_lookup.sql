-- 050_supervisor_name_lookup.sql
-- SECURITY DEFINER function so the employee directory can always resolve
-- supervisor names regardless of caller's RLS visibility.
-- Only returns id/first_name/surname — no sensitive fields exposed.

CREATE OR REPLACE FUNCTION get_supervisor_names(supervisor_ids UUID[])
RETURNS TABLE(id UUID, first_name TEXT, surname TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, first_name, surname
  FROM profiles
  WHERE id = ANY(supervisor_ids);
$$;
