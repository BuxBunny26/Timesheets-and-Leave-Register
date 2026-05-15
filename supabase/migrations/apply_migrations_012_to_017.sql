-- ============================================================
-- COMBINED MIGRATION: 012 → 017
-- Safe to run on a database that already has migrations 001–011.
-- All DROP IF EXISTS guards make this idempotent.
-- ============================================================


-- ============================================================
-- 012: LEAVE BALANCES
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_balances (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leave_type  TEXT NOT NULL CHECK (leave_type IN ('annual','sick','family','study')),
  year        INTEGER NOT NULL,
  total_days  NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days   NUMERIC(5,1) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT positive_days CHECK (total_days >= 0 AND used_days >= 0),
  UNIQUE(employee_id, leave_type, year)
);

DROP TRIGGER IF EXISTS update_leave_balances_updated_at ON leave_balances;
CREATE TRIGGER update_leave_balances_updated_at
  BEFORE UPDATE ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_leave_balances_lookup
  ON leave_balances(employee_id, leave_type, year);

ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lb_select_own"    ON leave_balances;
DROP POLICY IF EXISTS "lb_select_team"   ON leave_balances;
DROP POLICY IF EXISTS "lb_select_admin"  ON leave_balances;
DROP POLICY IF EXISTS "lb_insert_admin"  ON leave_balances;
DROP POLICY IF EXISTS "lb_update_admin"  ON leave_balances;
DROP POLICY IF EXISTS "lb_delete_admin"  ON leave_balances;

CREATE POLICY "lb_select_own" ON leave_balances
  FOR SELECT USING (employee_id = auth.uid());

CREATE POLICY "lb_select_team" ON leave_balances
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );

CREATE POLICY "lb_select_admin" ON leave_balances
  FOR SELECT USING (is_admin());

CREATE POLICY "lb_insert_admin" ON leave_balances
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "lb_update_admin" ON leave_balances
  FOR UPDATE USING (is_admin());

CREATE POLICY "lb_delete_admin" ON leave_balances
  FOR DELETE USING (is_admin());

CREATE OR REPLACE FUNCTION sync_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.leave_type NOT IN ('annual','sick','family','study') THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    INSERT INTO leave_balances (employee_id, leave_type, year, total_days, used_days)
    VALUES (
      NEW.employee_id,
      NEW.leave_type,
      EXTRACT(YEAR FROM NEW.start_date)::INTEGER,
      0,
      NEW.total_days
    )
    ON CONFLICT (employee_id, leave_type, year)
    DO UPDATE SET
      used_days  = leave_balances.used_days + EXCLUDED.used_days,
      updated_at = NOW();
  END IF;

  IF NEW.status IN ('denied','cancelled') AND OLD.status = 'approved' THEN
    UPDATE leave_balances
    SET
      used_days  = GREATEST(0, used_days - NEW.total_days),
      updated_at = NOW()
    WHERE
      employee_id = NEW.employee_id
      AND leave_type = NEW.leave_type
      AND year = EXTRACT(YEAR FROM NEW.start_date)::INTEGER;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_leave_balance ON leave_requests;
CREATE TRIGGER trg_sync_leave_balance
  AFTER UPDATE OF status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION sync_leave_balance();


-- ============================================================
-- 013: 50-HR OT MONTHLY THRESHOLD WARNING
-- ============================================================
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

DROP TRIGGER IF EXISTS trg_check_monthly_ot ON timesheet_days;
CREATE TRIGGER trg_check_monthly_ot
  AFTER INSERT OR UPDATE OF overtime_hours ON timesheet_days
  FOR EACH ROW EXECUTE FUNCTION check_monthly_ot_threshold();


-- ============================================================
-- 014: VERIFICATION DISPUTE COLUMNS + RLS
-- ============================================================
ALTER TABLE timesheet_verifications
  DROP CONSTRAINT IF EXISTS timesheet_verifications_status_check;

ALTER TABLE timesheet_verifications
  ADD COLUMN IF NOT EXISTS dispute_note        TEXT,
  ADD COLUMN IF NOT EXISTS dispute_flagged_to  UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE timesheet_verifications
  ADD CONSTRAINT timesheet_verifications_status_check
  CHECK (status IN ('pending','verified','overdue','disputed'));

-- Drop all existing tv_* policies (created by migration 007) then re-create with correct logic
DROP POLICY IF EXISTS "tv_select_own"    ON timesheet_verifications;
DROP POLICY IF EXISTS "tv_insert_own"    ON timesheet_verifications;
DROP POLICY IF EXISTS "tv_update_own"    ON timesheet_verifications;
DROP POLICY IF EXISTS "tv_select_admin"  ON timesheet_verifications;
DROP POLICY IF EXISTS "tv_update_admin"  ON timesheet_verifications;
DROP POLICY IF EXISTS "tv_select_team"   ON timesheet_verifications;

CREATE POLICY "tv_select_own" ON timesheet_verifications
  FOR SELECT USING (employee_id = auth.uid() OR is_admin());

CREATE POLICY "tv_insert_own" ON timesheet_verifications
  FOR INSERT WITH CHECK (employee_id = auth.uid());

CREATE POLICY "tv_update_own" ON timesheet_verifications
  FOR UPDATE USING (employee_id = auth.uid());

CREATE POLICY "tv_select_admin" ON timesheet_verifications
  FOR SELECT USING (is_admin());

CREATE POLICY "tv_update_admin" ON timesheet_verifications
  FOR UPDATE USING (is_admin());

CREATE POLICY "tv_select_team" ON timesheet_verifications
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );


-- ============================================================
-- 015: AUDIT LOG TRIGGERS
-- ============================================================
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

DROP TRIGGER IF EXISTS trg_audit_timesheet ON timesheet_weeks;
CREATE TRIGGER trg_audit_timesheet
  AFTER UPDATE OF status ON timesheet_weeks
  FOR EACH ROW EXECUTE FUNCTION audit_timesheet_status();

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

DROP TRIGGER IF EXISTS trg_audit_ot ON ot_approvals;
CREATE TRIGGER trg_audit_ot
  AFTER UPDATE OF status ON ot_approvals
  FOR EACH ROW EXECUTE FUNCTION audit_ot_approval();

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

DROP TRIGGER IF EXISTS trg_audit_leave ON leave_requests;
CREATE TRIGGER trg_audit_leave
  AFTER UPDATE OF status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION audit_leave_status();

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

DROP TRIGGER IF EXISTS trg_audit_leave_balance ON leave_balances;
CREATE TRIGGER trg_audit_leave_balance
  AFTER INSERT OR UPDATE ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION audit_leave_balance_change();


-- ============================================================
-- 016: AUDIT RLS, CLEANUP FUNCTION, INDEXES
-- ============================================================
DROP POLICY IF EXISTS "audit_select_admin" ON audit_log;
CREATE POLICY "audit_select_admin" ON audit_log
  FOR SELECT USING (is_admin());

CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM notifications
  WHERE is_read = TRUE
    AND created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tv_employee       ON timesheet_verifications(employee_id, period_month);
CREATE INDEX IF NOT EXISTS idx_tv_status         ON timesheet_verifications(status);


-- ============================================================
-- 017: AVATARS STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_own"   ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own"   ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own"   ON storage.objects;

CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ============================================================
-- FIX: Allow any authenticated user to insert notifications
-- (needed so employees can notify admin on dispute submission)
-- ============================================================
DROP POLICY IF EXISTS "notif_insert_service" ON notifications;
CREATE POLICY "notif_insert_service" ON notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
