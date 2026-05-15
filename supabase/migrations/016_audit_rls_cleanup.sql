-- Audit log RLS, cleanup function, and performance indexes

-- =====================
-- RLS for audit_log
-- =====================
-- Only admins can read the audit log
CREATE POLICY "audit_select_admin" ON audit_log
  FOR SELECT USING (is_admin());

-- SECURITY DEFINER trigger functions bypass RLS for inserts — no explicit policy needed.

-- =====================
-- Notification cleanup: purge old read notifications (call via pg_cron or manually)
-- =====================
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM notifications
  WHERE is_read = TRUE
    AND created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================
-- Performance indexes
-- =====================
CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tv_employee       ON timesheet_verifications(employee_id, period_month);
CREATE INDEX IF NOT EXISTS idx_tv_status         ON timesheet_verifications(status);
