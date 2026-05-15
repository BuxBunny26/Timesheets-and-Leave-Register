-- Monthly OT threshold warning (50 hrs)
-- Fires after INSERT or UPDATE of overtime_hours on timesheet_days.
-- When an employee's monthly OT total crosses 50 hrs for the first time,
-- in-app notifications go to their supervisor and that supervisor's manager.

CREATE OR REPLACE FUNCTION check_monthly_ot_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_employee_id   UUID;
  v_employee      profiles%ROWTYPE;
  v_month_start   DATE;
  v_others_total  NUMERIC;
  v_old_contrib   NUMERIC;
  v_before        NUMERIC;
  v_after         NUMERIC;
  v_supervisor_id UUID;
  v_manager_id    UUID;
BEGIN
  IF NEW.overtime_flag = FALSE OR NEW.overtime_hours IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tw.employee_id INTO v_employee_id
  FROM timesheet_weeks tw WHERE tw.id = NEW.timesheet_week_id;

  v_month_start := date_trunc('month', NEW.date::date)::date;

  -- Sum of every other OT row for this employee this month (excluding current row)
  SELECT COALESCE(SUM(td.overtime_hours), 0) INTO v_others_total
  FROM timesheet_days td
  JOIN timesheet_weeks tw ON tw.id = td.timesheet_week_id
  WHERE tw.employee_id = v_employee_id
    AND td.overtime_flag = TRUE
    AND date_trunc('month', td.date::date)::date = v_month_start
    AND td.id != NEW.id;

  v_old_contrib := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.overtime_hours, 0) ELSE 0 END;

  v_before := v_others_total + v_old_contrib;
  v_after  := v_others_total + COALESCE(NEW.overtime_hours, 0);

  IF v_before < 50 AND v_after >= 50 THEN
    SELECT * INTO v_employee FROM profiles WHERE id = v_employee_id;
    v_supervisor_id := v_employee.supervisor_id;

    IF v_supervisor_id IS NOT NULL THEN
      PERFORM create_notification(
        v_supervisor_id,
        'ot_threshold',
        '50-hr OT reached — ' || v_employee.first_name || ' ' || v_employee.surname,
        v_employee.first_name || ' ' || v_employee.surname ||
          ' has reached ' || ROUND(v_after::numeric, 1) ||
          ' overtime hours for ' || to_char(NEW.date::date, 'Month YYYY') || '.',
        'employee',
        v_employee_id
      );

      SELECT supervisor_id INTO v_manager_id FROM profiles WHERE id = v_supervisor_id;
      IF v_manager_id IS NOT NULL AND v_manager_id != v_supervisor_id THEN
        PERFORM create_notification(
          v_manager_id,
          'ot_threshold',
          '50-hr OT reached — ' || v_employee.first_name || ' ' || v_employee.surname,
          v_employee.first_name || ' ' || v_employee.surname ||
            ' has reached ' || ROUND(v_after::numeric, 1) ||
            ' overtime hours for ' || to_char(NEW.date::date, 'Month YYYY') || '.',
          'employee',
          v_employee_id
        );
      END IF;
    END IF;

    INSERT INTO audit_log (actor_id, action_type, entity_type, entity_id, new_value)
    VALUES (
      v_employee_id,
      'ot_threshold_reached',
      'employee',
      v_employee_id,
      jsonb_build_object(
        'month',          to_char(NEW.date::date, 'YYYY-MM'),
        'total_ot_hours', ROUND(v_after::numeric, 1)
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER trg_check_monthly_ot
  AFTER INSERT OR UPDATE OF overtime_hours ON timesheet_days
  FOR EACH ROW EXECUTE FUNCTION check_monthly_ot_threshold();
