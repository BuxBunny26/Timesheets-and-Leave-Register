-- 039_verification_requires_submitted_weeks.sql
-- Prevent an employee from verifying a month when one or more weeks that
-- overlap the period are missing or still in draft/rejected status.
-- A month can only be verified once every week in that month has been
-- submitted (or already approved by a supervisor).

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

  -- Weeks that overlap the period
  SELECT
    COUNT(*) FILTER (WHERE status NOT IN ('submitted','approved')),
    COUNT(*)
    INTO unsubmitted_count, week_count
  FROM timesheet_weeks
  WHERE employee_id = NEW.employee_id
    AND week_start <= period_end
    AND week_end   >= period_start;

  IF unsubmitted_count > 0 THEN
    RAISE EXCEPTION
      'Cannot verify %: % week(s) in this month are not yet submitted.',
      NEW.period_month, unsubmitted_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Make sure at least one week record exists. A "week in the month" is any
  -- Monday-Sunday block whose Monday <= period_end and Sunday >= period_start.
  -- A standard month spans 4 or 5 such weeks. Guard against the case where
  -- no weeks were created at all.
  IF week_count = 0 THEN
    RAISE EXCEPTION
      'Cannot verify %: no timesheet weeks exist for this period.',
      NEW.period_month
      USING ERRCODE = 'check_violation';
  END IF;

  -- Count expected ISO weeks overlapping the month
  SELECT COUNT(*)
    INTO expected_weeks
  FROM generate_series(
    date_trunc('week', period_start)::DATE,
    date_trunc('week', period_end)::DATE,
    INTERVAL '7 days'
  );

  IF week_count < expected_weeks THEN
    RAISE EXCEPTION
      'Cannot verify %: only % of % weeks have been started. Submit all weeks first.',
      NEW.period_month, week_count, expected_weeks
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_verification_weeks_submitted ON timesheet_verifications;

CREATE TRIGGER trg_enforce_verification_weeks_submitted
  BEFORE INSERT OR UPDATE OF status ON timesheet_verifications
  FOR EACH ROW
  EXECUTE FUNCTION enforce_verification_weeks_submitted();

-- One-off cleanup: revert any existing 'verified' rows whose underlying
-- weeks are not actually all submitted (data was verified before this rule
-- existed).
UPDATE timesheet_verifications v
   SET status = 'pending',
       verified_at = NULL
 WHERE v.status = 'verified'
   AND EXISTS (
     SELECT 1
       FROM timesheet_weeks w
      WHERE w.employee_id = v.employee_id
        AND w.week_start <=
            (make_date(
               split_part(v.period_month,'-',1)::INT,
               split_part(v.period_month,'-',2)::INT, 1)
             + INTERVAL '1 month' - INTERVAL '1 day')::DATE
        AND w.week_end   >=
            make_date(
               split_part(v.period_month,'-',1)::INT,
               split_part(v.period_month,'-',2)::INT, 1)
        AND w.status NOT IN ('submitted','approved')
   );

-- Also revert verifications where some expected weeks are entirely missing.
UPDATE timesheet_verifications v
   SET status = 'pending',
       verified_at = NULL
 WHERE v.status = 'verified'
   AND (
     SELECT COUNT(*)
       FROM timesheet_weeks w
      WHERE w.employee_id = v.employee_id
        AND w.week_start <=
            (make_date(
               split_part(v.period_month,'-',1)::INT,
               split_part(v.period_month,'-',2)::INT, 1)
             + INTERVAL '1 month' - INTERVAL '1 day')::DATE
        AND w.week_end   >=
            make_date(
               split_part(v.period_month,'-',1)::INT,
               split_part(v.period_month,'-',2)::INT, 1)
   ) < (
     SELECT COUNT(*)
       FROM generate_series(
         date_trunc('week',
           make_date(
             split_part(v.period_month,'-',1)::INT,
             split_part(v.period_month,'-',2)::INT, 1))::DATE,
         date_trunc('week',
           (make_date(
             split_part(v.period_month,'-',1)::INT,
             split_part(v.period_month,'-',2)::INT, 1)
            + INTERVAL '1 month' - INTERVAL '1 day')::DATE)::DATE,
         INTERVAL '7 days'
       )
   );
