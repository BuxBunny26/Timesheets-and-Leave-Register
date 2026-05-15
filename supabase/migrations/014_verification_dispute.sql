-- Extend timesheet_verifications with dispute support
-- Adds dispute_note, dispute_flagged_to columns and a 'disputed' status value.

-- Step 1: drop existing status constraint so we can broaden it
ALTER TABLE timesheet_verifications
  DROP CONSTRAINT IF EXISTS timesheet_verifications_status_check;

-- Step 2: add new columns (idempotent with IF NOT EXISTS)
ALTER TABLE timesheet_verifications
  ADD COLUMN IF NOT EXISTS dispute_note        TEXT,
  ADD COLUMN IF NOT EXISTS dispute_flagged_to  UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

-- Step 3: re-add constraint with the new 'disputed' value
ALTER TABLE timesheet_verifications
  ADD CONSTRAINT timesheet_verifications_status_check
  CHECK (status IN ('pending','verified','overdue','disputed'));

-- Step 4: RLS policies (these may not exist yet — use unique names)
-- Employee reads / inserts / updates own verifications
CREATE POLICY "tv_select_own" ON timesheet_verifications
  FOR SELECT USING (employee_id = auth.uid());

CREATE POLICY "tv_insert_own" ON timesheet_verifications
  FOR INSERT WITH CHECK (employee_id = auth.uid());

CREATE POLICY "tv_update_own" ON timesheet_verifications
  FOR UPDATE USING (employee_id = auth.uid());

-- Admins see and update all
CREATE POLICY "tv_select_admin" ON timesheet_verifications
  FOR SELECT USING (is_admin());

CREATE POLICY "tv_update_admin" ON timesheet_verifications
  FOR UPDATE USING (is_admin());

-- Supervisors/managers see their team's verifications
CREATE POLICY "tv_select_team" ON timesheet_verifications
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );
