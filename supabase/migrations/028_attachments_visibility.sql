-- Tighten attachment visibility:
--   * Employees: only their own uploads
--   * Direct supervisor of the uploader: can view
--   * Admin / system admin: view all
-- Also add explicit UPDATE and DELETE policies so uploaders can manage their
-- own attachments (used by the re-classify and remove actions in the UI).

DROP POLICY IF EXISTS "attach_select_own" ON attachments;

CREATE POLICY "attach_select_visible" ON attachments
  FOR SELECT USING (
    uploaded_by = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = attachments.uploaded_by
        AND p.supervisor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "attach_update_own" ON attachments;
CREATE POLICY "attach_update_own" ON attachments
  FOR UPDATE USING (uploaded_by = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "attach_delete_own" ON attachments;
CREATE POLICY "attach_delete_own" ON attachments
  FOR DELETE USING (uploaded_by = auth.uid() OR is_admin());
