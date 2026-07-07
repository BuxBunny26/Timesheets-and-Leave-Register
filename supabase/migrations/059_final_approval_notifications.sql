-- 059_final_approval_notifications.sql
-- Add in-app notifications (and therefore emails via the email-notification
-- webhook) for Stage 2 final approval/denial decisions made by a manager.
--
-- Stage 1 (supervisor approve/deny) already fires notifications via:
--   • trg_notify_leave_actioned     → leave_approved / leave_denied
--   • trg_notify_timesheet_reviewed → timesheet_approved / timesheet_rejected
--
-- Stage 2 (manager final sign-off on leave and OT) previously had no
-- notifications. This migration adds them.

-- =====================
-- TRIGGER: Leave final approval/denial → notify employee
-- =====================
CREATE OR REPLACE FUNCTION notify_leave_final_actioned()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when final_status actually changes
  IF OLD.final_status = NEW.final_status THEN RETURN NEW; END IF;
  IF NEW.final_status NOT IN ('approved', 'denied') THEN RETURN NEW; END IF;

  PERFORM create_notification(
    NEW.employee_id,
    'leave_final_' || NEW.final_status,
    'Leave request final ' || NEW.final_status,
    'Your ' || NEW.leave_type || ' leave request (' ||
      to_char(NEW.start_date, 'DD Mon') || ' – ' ||
      to_char(NEW.end_date, 'DD Mon YYYY') ||
      ') has received final ' || NEW.final_status ||
      CASE WHEN NEW.final_comment IS NOT NULL
           THEN '. Note: ' || NEW.final_comment
           ELSE '' END,
    'leave_request',
    NEW.id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_leave_final_actioned ON leave_requests;
CREATE TRIGGER trg_notify_leave_final_actioned
  AFTER UPDATE OF final_status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION notify_leave_final_actioned();

-- =====================
-- TRIGGER: OT final approval/denial → notify employee
-- =====================
CREATE OR REPLACE FUNCTION notify_ot_final_actioned()
RETURNS TRIGGER AS $$
DECLARE
  v_day_date    DATE;
  v_ot_hours    NUMERIC;
BEGIN
  -- Only fire when final_status actually changes
  IF OLD.final_status = NEW.final_status THEN RETURN NEW; END IF;
  IF NEW.final_status NOT IN ('approved', 'denied') THEN RETURN NEW; END IF;

  SELECT date, overtime_hours
    INTO v_day_date, v_ot_hours
    FROM timesheet_days
   WHERE id = NEW.timesheet_day_id;

  PERFORM create_notification(
    NEW.employee_id,
    'ot_final_' || NEW.final_status,
    'Overtime request final ' || NEW.final_status,
    'Your ' || COALESCE(v_ot_hours::TEXT, '?') || ' overtime hour(s) on ' ||
      to_char(v_day_date, 'DD Mon YYYY') ||
      ' received final ' || NEW.final_status ||
      CASE WHEN NEW.final_comment IS NOT NULL
           THEN '. Note: ' || NEW.final_comment
           ELSE '' END,
    'ot_approval',
    NEW.id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_ot_final_actioned ON ot_approvals;
CREATE TRIGGER trg_notify_ot_final_actioned
  AFTER UPDATE OF final_status ON ot_approvals
  FOR EACH ROW EXECUTE FUNCTION notify_ot_final_actioned();
