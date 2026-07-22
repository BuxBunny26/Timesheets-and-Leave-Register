-- 077_leave_balances_update.sql
-- Adds leave_type_id FK, cycle_start and cycle_end to leave_balances.
-- Backfills from existing year INTEGER and leave_type TEXT values.
-- Updates the sync_leave_balance trigger to use leave_types and leave_policy_rules.
--
-- CONFIRMED SCHEMA (query 3):
--   id, employee_id, leave_type TEXT, year INTEGER,
--   total_days NUMERIC DEFAULT 0, used_days NUMERIC DEFAULT 0,
--   updated_at TIMESTAMPTZ
--   (no created_at column — do not add it here)
--
-- ENGAGEMENT DATE WARNING (query 8):
--   All 115 employees are missing engagement_date.
--   Annual and sick leave cycles SHOULD use engagement_date as the basis.
--   Because dates are unavailable, ALL rows are backfilled using FY dates.
--   This is a known limitation — cycle dates must be corrected after
--   engagement dates are imported.
--
-- PREREQUISITES: migration 072 (leave_types), 073 (leave_policy_rules).
-- IDEMPOTENCY: IF NOT EXISTS + DO NOTHING guards.

-- ── 1. Add new columns ────────────────────────────────────────────────────────
ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS leave_type_id UUID REFERENCES leave_types(id);

ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS cycle_start DATE;

ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS cycle_end DATE;

COMMENT ON COLUMN leave_balances.year
  IS 'DEPRECATED: use cycle_start / cycle_end. '
     'Will be dropped in a later migration after production verification.';

COMMENT ON COLUMN leave_balances.leave_type
  IS 'DEPRECATED: use leave_type_id. '
     'Will be dropped in a later migration after production verification.';

-- ── 2. Backfill leave_type_id ────────────────────────────────────────────────
UPDATE leave_balances lb
SET leave_type_id = lt.id
FROM leave_types lt
WHERE lt.code = CASE lb.leave_type
  WHEN 'family' THEN 'family_responsibility'
  ELSE lb.leave_type
END
AND lb.leave_type_id IS NULL;

-- ── 3. Backfill cycle_start / cycle_end from year ────────────────────────────
-- All leave types use FY dates as a fallback because engagement dates are
-- unavailable for all 115 employees.
--
-- FY mapping: year 2026 → cycle_start = 2025-07-01, cycle_end = 2026-06-30
--
-- KNOWN LIMITATION: annual and sick leave cycles should use engagement_date.
-- Correct with:
--   UPDATE leave_balances lb
--   SET cycle_start = <computed from engagement_date>,
--       cycle_end   = <computed from engagement_date + cycle_months>,
--       year        = NULL   -- once deprecated column is safe to clear
--   FROM employee_details ed
--   WHERE ed.employee_id = lb.employee_id
--     AND ed.engagement_date IS NOT NULL;

UPDATE leave_balances
SET
  cycle_start = make_date(year - 1, 7, 1),
  cycle_end   = make_date(year,     6, 30)
WHERE cycle_start IS NULL
  AND year IS NOT NULL;

-- ── 4. Validate — no NULLs should remain ─────────────────────────────────────
DO $$
DECLARE unmapped_type INTEGER;
DECLARE unmapped_cycle INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped_type  FROM leave_balances WHERE leave_type_id IS NULL;
  SELECT COUNT(*) INTO unmapped_cycle FROM leave_balances WHERE cycle_start IS NULL OR cycle_end IS NULL;

  IF unmapped_type > 0 THEN
    RAISE EXCEPTION
      'migration 077: % leave_balances rows have NULL leave_type_id', unmapped_type;
  END IF;

  IF unmapped_cycle > 0 THEN
    RAISE NOTICE
      'migration 077: % leave_balances rows have NULL cycle_start/end — these have NULL year; investigate before adding NOT NULL constraint',
      unmapped_cycle;
  END IF;
END $$;

-- ── 5. Add new unique constraint (defer removing old one) ────────────────────
-- The old UNIQUE(employee_id, leave_type, year) constraint is kept until the
-- deprecated columns are dropped. The new constraint uses leave_type_id.
ALTER TABLE leave_balances
  DROP CONSTRAINT IF EXISTS leave_balances_employee_type_cycle_unique;

ALTER TABLE leave_balances
  ADD CONSTRAINT leave_balances_employee_type_cycle_unique
  UNIQUE (employee_id, leave_type_id, cycle_start);

-- ── 6. Update sync_leave_balance trigger ─────────────────────────────────────
-- Now resolves leave_type_id from leave_types and gets entitlement from
-- leave_policy_rules (Standard policy) instead of hardcoded values.
-- Transitional: still uses NEW.leave_type TEXT for the lookup until
-- leave_requests.leave_type_id is consistently populated.

CREATE OR REPLACE FUNCTION public.sync_leave_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lt_id       UUID;
  v_deducts     BOOLEAN;
  v_entitlement NUMERIC;
  v_cycle_start DATE;
  v_cycle_end   DATE;
  v_year        INTEGER;
BEGIN
  -- Resolve leave type record
  SELECT id INTO v_lt_id
    FROM leave_types
   WHERE code = CASE NEW.leave_type
                  WHEN 'family' THEN 'family_responsibility'
                  ELSE NEW.leave_type
                END
   LIMIT 1;

  IF v_lt_id IS NULL THEN RETURN NEW; END IF;

  -- Check whether this type deducts from a balance (Standard policy)
  SELECT r.deducts_balance, r.entitlement_days
    INTO v_deducts, v_entitlement
    FROM leave_policy_rules r
    JOIN leave_policies p ON p.id = r.leave_policy_id
   WHERE r.leave_type_id = v_lt_id
     AND p.code = 'standard'
   LIMIT 1;

  IF NOT COALESCE(v_deducts, FALSE) THEN RETURN NEW; END IF;

  -- Compute FY year bucket (prefer explicit leave_year; fall back to start_date)
  v_year := COALESCE(
    NEW.leave_year,
    CASE
      WHEN EXTRACT(MONTH FROM NEW.start_date) >= 7
        THEN EXTRACT(YEAR FROM NEW.start_date)::INT + 1
      ELSE EXTRACT(YEAR FROM NEW.start_date)::INT
    END
  );

  v_cycle_start := make_date(v_year - 1, 7, 1);
  v_cycle_end   := make_date(v_year,     6, 30);

  -- Upsert balance row (idempotent seed with entitlement from policy)
  INSERT INTO leave_balances
    (employee_id, leave_type, leave_type_id, year, cycle_start, cycle_end,
     total_days, used_days)
  VALUES (
    NEW.employee_id,
    NEW.leave_type,
    v_lt_id,
    v_year,
    v_cycle_start,
    v_cycle_end,
    COALESCE(v_entitlement, 0),
    0
  )
  ON CONFLICT (employee_id, leave_type_id, cycle_start) DO NOTHING;

  -- Increment on approval
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
    UPDATE leave_balances
      SET used_days  = GREATEST(0, used_days + NEW.total_days),
          updated_at = NOW()
     WHERE employee_id  = NEW.employee_id
       AND leave_type_id = v_lt_id
       AND cycle_start   = v_cycle_start;
  END IF;

  -- Decrement on un-approval
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'approved'
     AND NEW.status IN ('cancelled', 'denied') THEN
    UPDATE leave_balances
      SET used_days  = GREATEST(0, used_days - NEW.total_days),
          updated_at = NOW()
     WHERE employee_id  = NEW.employee_id
       AND leave_type_id = v_lt_id
       AND cycle_start   = v_cycle_start;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_leave_balance ON leave_requests;
CREATE TRIGGER trg_sync_leave_balance
  AFTER INSERT OR UPDATE OF status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_leave_balance();

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT lb.leave_type, lt.code, lb.year, lb.cycle_start, lb.cycle_end,
--        lb.total_days, lb.used_days
--   FROM leave_balances lb
--   JOIN leave_types lt ON lt.id = lb.leave_type_id
--  ORDER BY lb.employee_id, lb.cycle_start;
