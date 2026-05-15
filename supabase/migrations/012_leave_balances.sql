-- Leave Balances table
-- Tracks annual allocations (set by admin_manager) and used days (auto-updated on approval)
CREATE TABLE leave_balances (
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

CREATE TRIGGER update_leave_balances_updated_at
  BEFORE UPDATE ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_leave_balances_lookup ON leave_balances(employee_id, leave_type, year);

-- =====================
-- RLS
-- =====================
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

-- Employees read their own
CREATE POLICY "lb_select_own" ON leave_balances
  FOR SELECT USING (employee_id = auth.uid());

-- Supervisors/managers see their team
CREATE POLICY "lb_select_team" ON leave_balances
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );

-- Admins see all
CREATE POLICY "lb_select_admin" ON leave_balances
  FOR SELECT USING (is_admin());

-- Only admin_manager / system_admin may create / modify / delete balances
CREATE POLICY "lb_insert_admin" ON leave_balances
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "lb_update_admin" ON leave_balances
  FOR UPDATE USING (is_admin());

CREATE POLICY "lb_delete_admin" ON leave_balances
  FOR DELETE USING (is_admin());

-- =====================
-- Trigger: sync used_days when a leave_request is approved / reversed
-- =====================
CREATE OR REPLACE FUNCTION sync_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Only track the four balanceable types
  IF NEW.leave_type NOT IN ('annual','sick','family','study') THEN
    RETURN NEW;
  END IF;

  -- Leave newly approved → increment used_days (upsert so row always exists)
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

  -- Reversal: was approved, now denied or cancelled → decrement used_days
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

CREATE OR REPLACE TRIGGER trg_sync_leave_balance
  AFTER UPDATE OF status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION sync_leave_balance();
