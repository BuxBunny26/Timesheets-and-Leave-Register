-- Allow employees to read their direct supervisor's profile.
-- Needed so the supervisor name displays on the profile page via a Supabase join.
-- Uses SECURITY DEFINER to avoid RLS recursion when fetching supervisor_id.

CREATE OR REPLACE FUNCTION get_my_supervisor_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result UUID;
BEGIN
  SELECT supervisor_id INTO result
  FROM profiles
  WHERE id = auth.uid();
  RETURN result;
END;
$$;

DROP POLICY IF EXISTS "profiles_select_supervisor" ON profiles;
CREATE POLICY "profiles_select_supervisor" ON profiles
  FOR SELECT USING (id = get_my_supervisor_id());
