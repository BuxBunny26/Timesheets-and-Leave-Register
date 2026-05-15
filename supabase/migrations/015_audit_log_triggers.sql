-- Audit log population triggers
-- Records who changed what and when for timesheet approvals, OT approvals,
-- leave status changes, and leave balance edits.

-- =====================
-- Timesheet week status changes
-- =====================
CREATE OR REPLACE FUNCTION audit_timesheet_status()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
BEGIN
  BEGIN
    v_actor := (current_setting('request.jwt.claims', true)::json->>'sub')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NEW.employee_id;
  END;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_log (actor_id, action_type, entity_type, entity_id, old_value, new_value)
    VALUES (
      v_actor,
      'timesheet_status_change',
      'timesheet_week',
      NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'reviewer_comment', NEW.reviewer_comment)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER trg_audit_timesheet
  AFTER UPDATE OF status ON timesheet_weeks
  FOR EACH ROW EXECUTE FUNCTION audit_timesheet_status();

-- =====================
-- OT approval status changes
-- =====================
CREATE OR REPLACE FUNCTION audit_ot_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
BEGIN
  BEGIN
    v_actor := (current_setting('request.jwt.claims', true)::json->>'sub')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_actor := COALESCE(NEW.approver_id, NEW.employee_id);
  END;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_log (actor_id, action_type, entity_type, entity_id, old_value, new_value)
    VALUES (
      v_actor,
      'ot_' || NEW.status,
      'ot_approval',
      NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'comment', NEW.approver_comment)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER trg_audit_ot
  AFTER UPDATE OF status ON ot_approvals
  FOR EACH ROW EXECUTE FUNCTION audit_ot_approval();

-- =====================
-- Leave request status changes
-- =====================
CREATE OR REPLACE FUNCTION audit_leave_status()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
BEGIN
  BEGIN
    v_actor := (current_setting('request.jwt.claims', true)::json->>'sub')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_actor := COALESCE(NEW.supervisor_id, NEW.employee_id);
  END;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_log (actor_id, action_type, entity_type, entity_id, old_value, new_value)
    VALUES (
      v_actor,
      'leave_' || NEW.status,
      'leave_request',
      NEW.id,
      jsonb_build_object('status', OLD.status, 'leave_type', OLD.leave_type),
      jsonb_build_object('status', NEW.status, 'comment', NEW.supervisor_comment)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER trg_audit_leave
  AFTER UPDATE OF status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION audit_leave_status();

-- =====================
-- Leave balance admin edits
-- =====================
CREATE OR REPLACE FUNCTION audit_leave_balance_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
BEGIN
  BEGIN
    v_actor := (current_setting('request.jwt.claims', true)::json->>'sub')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  INSERT INTO audit_log (actor_id, action_type, entity_type, entity_id, old_value, new_value)
  VALUES (
    v_actor,
    CASE WHEN TG_OP = 'INSERT' THEN 'leave_balance_set' ELSE 'leave_balance_updated' END,
    'leave_balance',
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE'
      THEN jsonb_build_object('total_days', OLD.total_days, 'used_days', OLD.used_days)
      ELSE NULL
    END,
    jsonb_build_object(
      'employee_id', NEW.employee_id,
      'leave_type',  NEW.leave_type,
      'year',        NEW.year,
      'total_days',  NEW.total_days,
      'used_days',   NEW.used_days
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER trg_audit_leave_balance
  AFTER INSERT OR UPDATE ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION audit_leave_balance_change();
