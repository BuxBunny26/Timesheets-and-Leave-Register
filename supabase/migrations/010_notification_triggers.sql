-- =====================
-- HELPER: insert a notification row
-- =====================
CREATE OR REPLACE FUNCTION create_notification(
  p_recipient_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO notifications (recipient_id, type, title, message, related_entity_type, related_entity_id)
  VALUES (p_recipient_id, p_type, p_title, p_message, p_entity_type, p_entity_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================
-- TRIGGER: OT submitted → notify approver
-- =====================
CREATE OR REPLACE FUNCTION notify_ot_submitted()
RETURNS TRIGGER AS $$
DECLARE
  v_employee profiles%ROWTYPE;
  v_approver_id UUID;
  v_day_date DATE;
BEGIN
  -- Only fires on INSERT with overtime_flag = true
  IF NEW.overtime_flag = FALSE THEN RETURN NEW; END IF;

  -- Get employee info from the timesheet week
  SELECT p.* INTO v_employee
  FROM profiles p
  JOIN timesheet_weeks tw ON tw.employee_id = p.id
  WHERE tw.id = NEW.timesheet_week_id;

  v_day_date := NEW.date;
  v_approver_id := resolve_approver(v_employee.id, v_employee.supervisor_id);

  IF v_approver_id IS NOT NULL THEN
    PERFORM create_notification(
      v_approver_id,
      'ot_submitted',
      'Overtime submitted',
      v_employee.first_name || ' ' || v_employee.surname || ' logged ' || NEW.overtime_hours || ' OT hours on ' || to_char(v_day_date, 'DD Mon YYYY'),
      'timesheet_day',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER trg_notify_ot_submitted
  AFTER INSERT OR UPDATE OF overtime_flag ON timesheet_days
  FOR EACH ROW
  WHEN (NEW.overtime_flag = TRUE)
  EXECUTE FUNCTION notify_ot_submitted();

-- =====================
-- TRIGGER: Leave request submitted → notify supervisor
-- =====================
CREATE OR REPLACE FUNCTION notify_leave_submitted()
RETURNS TRIGGER AS $$
DECLARE
  v_employee profiles%ROWTYPE;
BEGIN
  IF NEW.status <> 'pending' OR TG_OP = 'UPDATE' THEN RETURN NEW; END IF;

  SELECT * INTO v_employee FROM profiles WHERE id = NEW.employee_id;

  IF NEW.supervisor_id IS NOT NULL THEN
    PERFORM create_notification(
      NEW.supervisor_id,
      'leave_submitted',
      'Leave request submitted',
      v_employee.first_name || ' ' || v_employee.surname || ' applied for ' || NEW.total_days || ' day(s) of ' || NEW.leave_type || ' leave from ' || to_char(NEW.start_date, 'DD Mon') || ' to ' || to_char(NEW.end_date, 'DD Mon YYYY'),
      'leave_request',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER trg_notify_leave_submitted
  AFTER INSERT ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION notify_leave_submitted();

-- =====================
-- TRIGGER: Leave approved/denied → notify employee
-- =====================
CREATE OR REPLACE FUNCTION notify_leave_actioned()
RETURNS TRIGGER AS $$
DECLARE
  v_supervisor profiles%ROWTYPE;
BEGIN
  -- Only fires when status changes from pending to approved/denied
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'denied') THEN RETURN NEW; END IF;

  SELECT * INTO v_supervisor FROM profiles WHERE id = NEW.supervisor_id;

  PERFORM create_notification(
    NEW.employee_id,
    'leave_' || NEW.status,
    'Leave request ' || NEW.status,
    'Your ' || NEW.leave_type || ' leave request (' || to_char(NEW.start_date, 'DD Mon') || ' – ' || to_char(NEW.end_date, 'DD Mon YYYY') || ') has been ' || NEW.status ||
      CASE WHEN NEW.supervisor_comment IS NOT NULL THEN '. Note: ' || NEW.supervisor_comment ELSE '' END,
    'leave_request',
    NEW.id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER trg_notify_leave_actioned
  AFTER UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION notify_leave_actioned();

-- =====================
-- TRIGGER: AWOL recorded → immediately notify supervisor
-- =====================
CREATE OR REPLACE FUNCTION notify_awol_recorded()
RETURNS TRIGGER AS $$
DECLARE
  v_employee profiles%ROWTYPE;
  v_approver_id UUID;
BEGIN
  IF NEW.primary_status <> 'awol' THEN RETURN NEW; END IF;
  IF OLD.primary_status = 'awol' THEN RETURN NEW; END IF;

  SELECT p.* INTO v_employee
  FROM profiles p
  JOIN timesheet_weeks tw ON tw.employee_id = p.id
  WHERE tw.id = NEW.timesheet_week_id;

  v_approver_id := v_employee.supervisor_id;

  IF v_approver_id IS NOT NULL THEN
    PERFORM create_notification(
      v_approver_id,
      'awol',
      'AWOL — immediate attention required',
      v_employee.first_name || ' ' || v_employee.surname || ' has been marked AWOL on ' || to_char(NEW.date, 'DD Mon YYYY'),
      'timesheet_day',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER trg_notify_awol
  AFTER INSERT OR UPDATE OF primary_status ON timesheet_days
  FOR EACH ROW EXECUTE FUNCTION notify_awol_recorded();

-- =====================
-- TRIGGER: Timesheet submitted → notify employee (copy confirmation)
-- =====================
CREATE OR REPLACE FUNCTION notify_timesheet_submitted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status <> 'submitted' THEN RETURN NEW; END IF;
  IF OLD.status = 'submitted' THEN RETURN NEW; END IF;

  PERFORM create_notification(
    NEW.employee_id,
    'timesheet_submitted',
    'Timesheet submitted',
    'Your timesheet for the week of ' || to_char(NEW.week_start, 'DD Mon YYYY') || ' has been submitted successfully.',
    'timesheet_week',
    NEW.id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER trg_notify_timesheet_submitted
  AFTER UPDATE ON timesheet_weeks
  FOR EACH ROW EXECUTE FUNCTION notify_timesheet_submitted();

-- =====================
-- TRIGGER: Timesheet approved/rejected → notify employee
-- =====================
CREATE OR REPLACE FUNCTION notify_timesheet_reviewed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  PERFORM create_notification(
    NEW.employee_id,
    'timesheet_' || NEW.status,
    'Timesheet ' || NEW.status,
    'Your timesheet for the week of ' || to_char(NEW.week_start, 'DD Mon YYYY') || ' has been ' || NEW.status ||
      CASE WHEN NEW.reviewer_comment IS NOT NULL THEN '. Comment: ' || NEW.reviewer_comment ELSE '' END,
    'timesheet_week',
    NEW.id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER trg_notify_timesheet_reviewed
  AFTER UPDATE ON timesheet_weeks
  FOR EACH ROW EXECUTE FUNCTION notify_timesheet_reviewed();

-- Fix notification INSERT policy to allow trigger/service role inserts
DROP POLICY IF EXISTS "notif_insert_service" ON notifications;
CREATE POLICY "notif_insert_service" ON notifications
  FOR INSERT WITH CHECK (TRUE);
