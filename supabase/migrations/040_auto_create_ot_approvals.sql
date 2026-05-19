-- 040_auto_create_ot_approvals.sql
-- Auto-create an ot_approvals row for every OT day. Without this, the
-- Approvals queue is always empty because nothing ever inserts into
-- ot_approvals. Approver = employee's supervisor (resolved via
-- resolve_approver so an employee never approves their own OT).
--
-- Also keeps the row in sync if the day's OT flag/hours change, or the
-- employee's supervisor changes after submission (only while the approval
-- is still pending).

CREATE OR REPLACE FUNCTION sync_ot_approval_for_day()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
  v_supervisor_id UUID;
  v_approver_id UUID;
  v_existing_id UUID;
  v_existing_status TEXT;
BEGIN
  SELECT p.id, p.supervisor_id
    INTO v_employee_id, v_supervisor_id
  FROM profiles p
  JOIN timesheet_weeks tw ON tw.employee_id = p.id
  WHERE tw.id = NEW.timesheet_week_id;

  IF v_employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_approver_id := resolve_approver(v_employee_id, v_supervisor_id);

  SELECT id, status
    INTO v_existing_id, v_existing_status
  FROM ot_approvals
  WHERE timesheet_day_id = NEW.id
  LIMIT 1;

  IF NEW.overtime_flag = TRUE THEN
    IF v_existing_id IS NULL THEN
      INSERT INTO ot_approvals (timesheet_day_id, employee_id, approver_id, status)
      VALUES (NEW.id, v_employee_id, v_approver_id, 'pending');
    ELSIF v_existing_status = 'pending' THEN
      -- Refresh approver if supervisor changed while still pending.
      UPDATE ot_approvals
         SET approver_id = v_approver_id
       WHERE id = v_existing_id
         AND approver_id IS DISTINCT FROM v_approver_id;
    END IF;
  ELSE
    -- OT turned off: remove the still-pending approval; keep any already
    -- approved/denied history intact.
    IF v_existing_id IS NOT NULL AND v_existing_status = 'pending' THEN
      DELETE FROM ot_approvals WHERE id = v_existing_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ot_approval ON timesheet_days;

CREATE TRIGGER trg_sync_ot_approval
  AFTER INSERT OR UPDATE OF overtime_flag, overtime_hours, timesheet_week_id ON timesheet_days
  FOR EACH ROW
  EXECUTE FUNCTION sync_ot_approval_for_day();

-- Backfill: create approval rows for existing OT days that don't have one.
INSERT INTO ot_approvals (timesheet_day_id, employee_id, approver_id, status)
SELECT
  d.id,
  p.id,
  resolve_approver(p.id, p.supervisor_id),
  'pending'
FROM timesheet_days d
JOIN timesheet_weeks tw ON tw.id = d.timesheet_week_id
JOIN profiles p ON p.id = tw.employee_id
LEFT JOIN ot_approvals oa ON oa.timesheet_day_id = d.id
WHERE d.overtime_flag = TRUE
  AND oa.id IS NULL
  AND resolve_approver(p.id, p.supervisor_id) IS NOT NULL;

-- Refresh approver_id on any existing pending approvals whose employee's
-- supervisor has since changed.
UPDATE ot_approvals oa
   SET approver_id = resolve_approver(p.id, p.supervisor_id)
  FROM profiles p
 WHERE oa.employee_id = p.id
   AND oa.status = 'pending'
   AND oa.approver_id IS DISTINCT FROM resolve_approver(p.id, p.supervisor_id);
