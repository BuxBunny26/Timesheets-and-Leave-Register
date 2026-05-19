-- 032_timesheet_supervisor_notification.sql
-- When an employee submits a timesheet, also notify their supervisor so they
-- know an approval is waiting. (Previously only the employee got a confirmation.)

CREATE OR REPLACE FUNCTION notify_timesheet_supervisor_on_submit()
RETURNS TRIGGER AS $$
DECLARE
  v_employee profiles%ROWTYPE;
  v_approver_id UUID;
BEGIN
  IF NEW.status <> 'submitted' THEN RETURN NEW; END IF;
  IF OLD.status = 'submitted' THEN RETURN NEW; END IF;

  SELECT * INTO v_employee FROM profiles WHERE id = NEW.employee_id;
  v_approver_id := resolve_approver(v_employee.id, v_employee.supervisor_id);

  IF v_approver_id IS NOT NULL AND v_approver_id <> NEW.employee_id THEN
    PERFORM create_notification(
      v_approver_id,
      'timesheet_submitted_supervisor',
      'Timesheet awaiting your approval',
      v_employee.first_name || ' ' || v_employee.surname ||
      ' submitted their timesheet for the week of ' ||
      to_char(NEW.week_start, 'DD Mon YYYY') || '.',
      'timesheet_week',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_timesheet_supervisor_on_submit ON timesheet_weeks;
CREATE TRIGGER trg_notify_timesheet_supervisor_on_submit
  AFTER UPDATE ON timesheet_weeks
  FOR EACH ROW
  EXECUTE FUNCTION notify_timesheet_supervisor_on_submit();
