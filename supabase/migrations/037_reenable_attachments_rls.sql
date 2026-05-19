-- 037_reenable_attachments_rls.sql
-- CRITICAL FIX: Row-level security was disabled on `attachments`, so every
-- authenticated user could read every row regardless of the policies that
-- were already in place (mig 028, 035). This re-enables RLS and removes the
-- now-redundant legacy policy from mig 028 so only `attachments_select_scoped`
-- governs SELECT.

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- Drop the duplicate (logically equivalent) SELECT policy from mig 028.
DROP POLICY IF EXISTS attach_select_visible ON attachments;
