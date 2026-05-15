-- Public Holidays
CREATE TABLE public_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  name TEXT NOT NULL,
  country_code TEXT NOT NULL CHECK (country_code IN ('ZA','MZ','NA')),
  is_custom BOOLEAN DEFAULT FALSE,
  UNIQUE(date, country_code)
);

-- Timesheet Weeks
CREATE TABLE timesheet_weeks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES profiles(id),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected')),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  reviewer_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, week_start)
);

CREATE TRIGGER update_timesheet_weeks_updated_at
  BEFORE UPDATE ON timesheet_weeks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Timesheet Days
CREATE TABLE timesheet_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_week_id UUID NOT NULL REFERENCES timesheet_weeks(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  day_of_week TEXT NOT NULL,
  primary_status TEXT NOT NULL DEFAULT 'present'
    CHECK (primary_status IN ('present','leave','sick','awol','public_holiday','standby')),
  overtime_flag BOOLEAN DEFAULT FALSE,
  overtime_hours DECIMAL(4,2),
  lol_flag BOOLEAN DEFAULT FALSE,
  loi_flag BOOLEAN DEFAULT FALSE,
  notes TEXT,
  is_locked BOOLEAN DEFAULT FALSE,
  CONSTRAINT valid_ot CHECK (
    (overtime_flag = FALSE) OR
    (overtime_flag = TRUE AND overtime_hours IS NOT NULL AND overtime_hours > 0)
  )
);

-- OT Approvals
CREATE TABLE ot_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_day_id UUID NOT NULL REFERENCES timesheet_days(id),
  employee_id UUID NOT NULL REFERENCES profiles(id),
  approver_id UUID REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied')),
  approver_comment TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  actioned_at TIMESTAMPTZ,
  CONSTRAINT no_self_approval CHECK (employee_id != approver_id)
);
