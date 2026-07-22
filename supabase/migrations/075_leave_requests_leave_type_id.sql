-- 075_leave_requests_leave_type_id.sql
-- Adds leave_type_id FK to leave_requests; extends status CHECK constraints
-- to include 'returned'; adds revision tracking; backfills leave_type_id for
-- all existing rows.
--
-- EXISTING DATA (query 6):
--   annual: 2 rows, study: 2 rows — no 'family' data to remap.
--
-- EXISTING CONSTRAINTS (query 4):
--   status CHECK:       pending, approved, denied, cancelled
--   final_status CHECK: pending, approved, denied
--   leave_type CHECK:   annual, sick, family, study, unpaid, other
--   (no 'returned', no maternity/adoption/parental/family_responsibility)
--
-- PREREQUISITES: migration 072 (leave_types) must be applied first.
-- IDEMPOTENCY: IF NOT EXISTS / IF EXISTS guards throughout.

-- ── 1. Add leave_type_id FK (nullable — backfilled below) ────────────────────
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS leave_type_id UUID REFERENCES leave_types(id);

-- ── 2. Add revision tracking for the return-and-restart workflow ─────────────
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS last_returned_by UUID REFERENCES profiles(id);

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS last_returned_at TIMESTAMPTZ;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS last_return_reason TEXT;

-- ── 3. Extend status CHECK to include 'returned' ─────────────────────────────
-- Drop and recreate because PostgreSQL cannot ADD a value to a CHECK constraint
-- directly — the constraint must be dropped and re-added.

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_status_check;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('pending', 'approved', 'denied', 'cancelled', 'returned'));

-- ── 4. Extend final_status CHECK to include 'returned' ───────────────────────
ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_final_status_check;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_final_status_check
  CHECK (final_status IN ('pending', 'approved', 'denied', 'returned'));

-- ── 5. Extend leave_type CHECK to include new categories ─────────────────────
-- 'family_responsibility' replaces 'family' long-term; 'family' is retained
-- temporarily for backward compatibility with old leave_balances rows.
-- 'family' will be removed in a later migration after all rows are backfilled.

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_leave_type_check
  CHECK (leave_type IN (
    'annual', 'sick',
    'family',                -- DEPRECATED: maps to family_responsibility
    'family_responsibility',
    'study', 'maternity', 'adoption', 'parental', 'unpaid', 'other'
  ));

COMMENT ON COLUMN leave_requests.leave_type
  IS 'DEPRECATED: use leave_type_id. The value ''family'' maps to ''family_responsibility'' '
     'in leave_types. Will be dropped after all consumers are migrated to leave_type_id.';

-- ── 6. Add executive cross-approval guard ────────────────────────────────────
-- Prevents the requester or Stage 1 approver from performing Stage 2.
ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS no_self_executive_approval;

ALTER TABLE leave_requests
  ADD CONSTRAINT no_self_executive_approval CHECK (
    final_approver_id IS NULL OR (
      final_approver_id != employee_id
      AND (supervisor_id IS NULL OR final_approver_id != supervisor_id)
    )
  );

-- ── 7. Backfill leave_type_id for all existing rows ──────────────────────────
-- Maps: annual → annual, study → study
-- 'family' → family_responsibility (none exist in current data per query 6)
-- All 4 existing rows will be updated.

UPDATE leave_requests lr
SET leave_type_id = lt.id
FROM leave_types lt
WHERE lt.code = CASE lr.leave_type
  WHEN 'family' THEN 'family_responsibility'
  ELSE lr.leave_type
END
AND lr.leave_type_id IS NULL;

-- ── 8. Validation ─────────────────────────────────────────────────────────────
-- This must return 0 before proceeding:
DO $$
DECLARE unmapped INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped FROM leave_requests WHERE leave_type_id IS NULL;
  IF unmapped > 0 THEN
    RAISE EXCEPTION
      'migration 075: % leave_request rows still have NULL leave_type_id — check for unknown leave_type values',
      unmapped;
  END IF;
END $$;

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT lr.leave_type, lt.code AS mapped_code, lt.name, COUNT(*) AS cnt
--   FROM leave_requests lr
--   JOIN leave_types lt ON lt.id = lr.leave_type_id
--  GROUP BY lr.leave_type, lt.code, lt.name ORDER BY lr.leave_type;
-- Expected: annual→Annual Leave (2 rows), study→Study Leave (2 rows)
