-- 045_verification_dedupe_legacy_weeks.sql
-- Fix the verification trigger so that:
--   1. Legacy "ghost" week rows (week_start anchored on Sunday due to an old
--      timezone bug) are deduped against the real Monday-anchored row for the
--      same ISO week. We pick the most-progressed status per ISO week
--      (approved > submitted > rejected > draft) before counting.
--   2. Future weeks (whose Monday is after today) are not required — a user
--      verifying the current month shouldn't be blocked by weeks that
--      haven't started yet.

CREATE OR REPLACE FUNCTION enforce_verification_weeks_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr INT;
  mo INT;
  period_start DATE;
  period_end   DATE;
  effective_end DATE;
  unsubmitted_count INT;
  week_count INT;
  expected_weeks INT;
BEGIN
  -- Only enforce when transitioning to 'verified'
  IF NEW.status IS DISTINCT FROM 'verified' THEN
    RETURN NEW;
  END IF;

  IF NEW.period_month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid period_month format: %', NEW.period_month;
  END IF;

  yr := split_part(NEW.period_month, '-', 1)::INT;
  mo := split_part(NEW.period_month, '-', 2)::INT;
  period_start := make_date(yr, mo, 1);
  period_end   := (period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Don't require future weeks. Cap the effective end at the most recent
  -- Monday on or before today.
  effective_end := LEAST(
    period_end,
    (date_trunc('week', CURRENT_DATE)::DATE + INTERVAL '6 days')::DATE
  );

  -- Dedupe weeks by their true Monday (ISO week start) and keep the most
  -- progressed status per week, then count what's still not submitted.
  WITH normalised AS (
    SELECT
      date_trunc('week', week_start)::DATE AS true_monday,
      status,
      CASE status
        WHEN 'approved'  THEN 3
        WHEN 'submitted' THEN 2
        WHEN 'rejected'  THEN 1
        ELSE 0
      END AS rank
    FROM timesheet_weeks
    WHERE employee_id = NEW.employee_id
      AND week_start <= period_end
      AND week_end   >= period_start
  ), best AS (
    SELECT DISTINCT ON (true_monday)
      true_monday, status
    FROM normalised
    WHERE true_monday BETWEEN period_start AND effective_end
    ORDER BY true_monday, rank DESC
  )
  SELECT
    COUNT(*) FILTER (WHERE status NOT IN ('submitted','approved')),
    COUNT(*)
    INTO unsubmitted_count, week_count
  FROM best;

  IF unsubmitted_count > 0 THEN
    RAISE EXCEPTION
      'Cannot verify %: % week(s) in this month are not yet submitted.',
      NEW.period_month, unsubmitted_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Expected weeks: ISO weeks whose Monday falls between the period start
  -- and today (whichever is earlier than the period end).
  SELECT COUNT(*)
    INTO expected_weeks
  FROM generate_series(
    date_trunc('week', period_start)::DATE,
    date_trunc('week', effective_end)::DATE,
    INTERVAL '7 days'
  ) AS gs(monday)
  WHERE gs.monday BETWEEN period_start AND effective_end;

  IF week_count < expected_weeks THEN
    RAISE EXCEPTION
      'Cannot verify %: only % of % weeks have been started. Submit all weeks first.',
      NEW.period_month, week_count, expected_weeks
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
