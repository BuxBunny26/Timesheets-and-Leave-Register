-- 035_attachments_team_visibility.sql
-- Tighten attachment visibility:
--   * employee   -> only attachments they uploaded
--   * supervisor -> own uploads + uploads from their direct reports
--   * manager+   -> everything (is_admin() already true for them)

DROP POLICY IF EXISTS "attach_select_own"   ON attachments;
DROP POLICY IF EXISTS "attachments_select"  ON attachments;

CREATE POLICY "attachments_select_scoped"
ON attachments FOR SELECT
USING (
  uploaded_by = auth.uid()
  OR is_admin()
  OR uploaded_by IN (
    SELECT id FROM profiles WHERE supervisor_id = auth.uid()
  )
);

-- Same scoping for DELETE (employees their own, admins all). Keep existing
-- policy and re-create idempotently in case it diverged.
DROP POLICY IF EXISTS "attachments_delete" ON attachments;
CREATE POLICY "attachments_delete"
ON attachments FOR DELETE
USING (uploaded_by = auth.uid() OR is_admin());
