-- 078_working_days_function.sql
-- Creates calculate_working_days() — a server-side Mon–Fri working-day counter
-- that excludes public holidays configured in the public_holidays table.
--
-- LIMITATION: Not roster-aware. Assumes a standard Monday–Friday work week.
-- Does not account for:
--   - Employees on non-standard schedules (shift workers, weekend workers)
--   - Rotating rosters
--   - Client-site schedules
--   - Employees with no site/country configuration (falls back to 'ZA')
--   - Cross-border employees on multiple country calendars
--
-- Future improvement: employee_schedules or work_patterns table.
-- IDEMPOTENCY: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION calculate_working_days(
  p_start      DATE,
  p_end        DATE,
  p_country    TEXT DEFAULT 'ZA'
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur  DATE    := p_start;
  v_days INTEGER := 0;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RETURN 0;
  END IF;

  WHILE v_cur <= p_end LOOP
    -- Skip weekends (0 = Sunday, 6 = Saturday in PostgreSQL)
    IF EXTRACT(DOW FROM v_cur) NOT IN (0, 6)
       -- Skip configured public holidays for the employee's country
       AND NOT EXISTS (
         SELECT 1 FROM public_holidays
          WHERE date = v_cur
            AND country_code = COALESCE(p_country, 'ZA')
       )
    THEN
      v_days := v_days + 1;
    END IF;
    v_cur := v_cur + INTERVAL '1 day';
  END LOOP;

  RETURN v_days;
END;
$$;

COMMENT ON FUNCTION calculate_working_days(DATE, DATE, TEXT) IS
  'Counts Mon–Fri working days between p_start and p_end inclusive, '
  'excluding public holidays for p_country (defaults to ZA). '
  'Not roster-aware — assumes a standard 5-day work week.';

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT calculate_working_days('2026-07-07', '2026-07-11', 'ZA');
-- Expected: 5 (no ZA public holidays in that week)
