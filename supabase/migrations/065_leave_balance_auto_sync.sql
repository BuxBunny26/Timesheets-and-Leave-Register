-- 065_leave_balance_auto_sync.sql
-- Replaces sync_leave_balance() trigger function so that leave_balances.used_days
-- stays accurate whenever a leave request is approved, denied, or cancelled.
--
-- Design:
--   • Fires AFTER INSERT OR UPDATE OF status ON leave_requests
--   • On status → 'approved'  : increments used_days
--   • On status from 'approved' → 'denied'|'cancelled' : decrements used_days
--   • Only tracks balance-managed types: annual, sick, family, study
--   • Upserts a leave_balances row with statutory default total_days if missing
--   • used_days is clamped to 0 to prevent negative values

CREATE OR REPLACE FUNCTION public.sync_leave_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER;
BEGIN
  -- Only manage balance-tracked leave types
  IF NEW.leave_type NOT IN ('annual', 'sick', 'family', 'study') THEN
    RETURN NEW;
  END IF;

  -- Resolve the FY-year bucket (prefer the explicit leave_year column)
  v_year := COALESCE(
    NEW.leave_year,
    CASE
      WHEN EXTRACT(MONTH FROM NEW.start_date) >= 7
        THEN EXTRACT(YEAR FROM NEW.start_date)::INT + 1
      ELSE EXTRACT(YEAR FROM NEW.start_date)::INT
    END
  );

  -- Ensure a leave_balances row exists; seed with statutory default if new
  INSERT INTO leave_balances (employee_id, leave_type, year, total_days, used_days)
  VALUES (
    NEW.employee_id,
    NEW.leave_type,
    v_year,
    CASE NEW.leave_type
      WHEN 'annual' THEN 15
      WHEN 'sick'   THEN 30
      WHEN 'family' THEN 3
      ELSE 0
    END,
    0
  )
  ON CONFLICT (employee_id, leave_type, year) DO NOTHING;

  -- ── Increment when newly approved ─────────────────────────────────────────
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status <> 'approved') THEN
    UPDATE leave_balances
      SET used_days  = GREATEST(0, used_days + NEW.total_days),
          updated_at = NOW()
      WHERE employee_id = NEW.employee_id
        AND leave_type  = NEW.leave_type
        AND year        = v_year;
  END IF;

  -- ── Decrement when un-approved (cancelled or denied after approval) ────────
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'approved'
     AND NEW.status IN ('cancelled', 'denied') THEN
    UPDATE leave_balances
      SET used_days  = GREATEST(0, used_days - NEW.total_days),
          updated_at = NOW()
      WHERE employee_id = NEW.employee_id
        AND leave_type  = NEW.leave_type
        AND year        = v_year;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (drop first to avoid duplicate)
DROP TRIGGER IF EXISTS trg_sync_leave_balance ON leave_requests;

CREATE TRIGGER trg_sync_leave_balance
  AFTER INSERT OR UPDATE OF status ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_leave_balance();
