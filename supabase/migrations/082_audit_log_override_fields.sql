-- 082_audit_log_override_fields.sql
-- Adds override tracking fields to audit_log for leave/timesheet mismatch
-- overrides and other authorised corrections.
--
-- Every override must record: reason, actor, timestamp, old value, new value.
-- The existing old_value/new_value JSONB columns cover the data change.
-- These new columns capture the authorisation metadata.
--
-- IDEMPOTENCY: ADD COLUMN IF NOT EXISTS.

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS overridden_by UUID REFERENCES profiles(id);

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS overridden_at TIMESTAMPTZ;

COMMENT ON COLUMN audit_log.override_reason IS
  'Required when action_type contains ''override''. '
  'Must describe why the standard rule was bypassed.';

COMMENT ON COLUMN audit_log.overridden_by IS
  'The user who authorised the override. Must have can_override_leave = TRUE '
  'for leave/timesheet mismatch overrides.';

COMMENT ON COLUMN audit_log.overridden_at IS
  'Timestamp of the override action. Distinct from created_at which is the '
  'audit record creation time.';

-- Index for override audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_overridden_by
  ON audit_log(overridden_by)
  WHERE overridden_by IS NOT NULL;

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'audit_log'
--    AND column_name IN ('override_reason','overridden_by','overridden_at')
--  ORDER BY column_name;
-- Expected: 3 rows
