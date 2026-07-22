-- 076_timesheet_days_leave_fk.sql
-- Adds leave_type_id and leave_request_id foreign-key columns to
-- timesheet_days, and registers invariant constraints as NOT VALID
-- (validated separately after existing data is confirmed clean).
--
-- TRANSITIONAL NOTE:
-- The application currently uses leave_type_detail (UI-only React state)
-- for display. Once this migration is applied and the application is updated
-- to send leave_type_id and leave_request_id in the upsert, the transitional
-- helper code (leaveDetailFromRequest, leaveTypeName, LEAVE_TYPE_NAMES,
-- DayState.leave_type_detail) must be removed from TimesheetsPage.tsx.
--
-- PREREQUISITES: migrations 072 and 075 must be applied first.
-- IDEMPOTENCY: IF NOT EXISTS throughout.

-- ── Add FK columns ────────────────────────────────────────────────────────────
ALTER TABLE timesheet_days
  ADD COLUMN IF NOT EXISTS leave_type_id    UUID REFERENCES leave_types(id),
  ADD COLUMN IF NOT EXISTS leave_request_id UUID REFERENCES leave_requests(id);

COMMENT ON COLUMN timesheet_days.leave_type_id
  IS 'FK to leave_types. Required when primary_status = ''leave''. '
     'Replaces the transitional UI-only leave_type_detail field in React.';

COMMENT ON COLUMN timesheet_days.leave_request_id
  IS 'FK to the specific leave_request that authorises this leave day. '
     'Nullable for draft days before the request is matched.';

-- ── Invariant constraints (NOT VALID — validated in migration 083) ────────────
-- NOT VALID means the constraint applies to NEW rows immediately but does not
-- scan existing rows. Run migration 083 VALIDATE CONSTRAINT after confirming
-- all existing rows satisfy the rule.

ALTER TABLE timesheet_days
  DROP CONSTRAINT IF EXISTS chk_leave_type_required_for_leave;

ALTER TABLE timesheet_days
  ADD CONSTRAINT chk_leave_type_required_for_leave
  CHECK (primary_status != 'leave' OR leave_type_id IS NOT NULL)
  NOT VALID;

ALTER TABLE timesheet_days
  DROP CONSTRAINT IF EXISTS chk_leave_type_null_for_non_leave;

ALTER TABLE timesheet_days
  ADD CONSTRAINT chk_leave_type_null_for_non_leave
  CHECK (primary_status = 'leave' OR leave_type_id IS NULL)
  NOT VALID;

-- ── Index for leave request lookups ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_timesheet_days_leave_request_id
  ON timesheet_days(leave_request_id)
  WHERE leave_request_id IS NOT NULL;

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'timesheet_days'
--    AND column_name IN ('leave_type_id', 'leave_request_id')
--  ORDER BY column_name;
-- Expected: both columns present, is_nullable = YES.
--
-- SELECT conname, convalidated, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'timesheet_days'::regclass
--    AND conname IN ('chk_leave_type_required_for_leave',
--                    'chk_leave_type_null_for_non_leave');
-- Expected: both present, convalidated = false (validated in migration 083).
