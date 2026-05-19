-- 038_reset_verification_on_resubmit.sql
-- When a timesheet week is (re)submitted, invalidate the employee's monthly
-- verification for any month the week touches. The employee must re-verify
-- so the verified snapshot always reflects the latest submitted data.

CREATE OR REPLACE FUNCTION reset_verification_on_week_submit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m_start TEXT;
  m_end   TEXT;
BEGIN
  -- Only act on transitions into 'submitted' (incl. resubmits where
  -- submitted_at changes) and on direct INSERTs of submitted rows.
  IF NEW.status <> 'submitted' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'submitted'
     AND OLD.submitted_at IS NOT DISTINCT FROM NEW.submitted_at THEN
    RETURN NEW;
  END IF;

  m_start := to_char(NEW.week_start, 'YYYY-MM');
  m_end   := to_char(NEW.week_end,   'YYYY-MM');

  UPDATE timesheet_verifications
     SET status = 'pending',
         verified_at = NULL
   WHERE employee_id = NEW.employee_id
     AND status = 'verified'
     AND period_month IN (m_start, m_end);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_verification_on_week_submit ON timesheet_weeks;

CREATE TRIGGER trg_reset_verification_on_week_submit
  AFTER INSERT OR UPDATE OF status, submitted_at ON timesheet_weeks
  FOR EACH ROW
  EXECUTE FUNCTION reset_verification_on_week_submit();
