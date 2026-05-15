-- Attachments
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  linked_to_type TEXT NOT NULL CHECK (linked_to_type IN ('timesheet','leave_request')),
  linked_to_id UUID NOT NULL,
  display_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timesheet Verifications
CREATE TABLE timesheet_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES profiles(id),
  period_month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','overdue')),
  verified_at TIMESTAMPTZ,
  UNIQUE(employee_id, period_month)
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  related_entity_type TEXT,
  related_entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES profiles(id),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_timesheet_weeks_employee ON timesheet_weeks(employee_id);
CREATE INDEX idx_timesheet_weeks_status ON timesheet_weeks(status);
CREATE INDEX idx_timesheet_days_week ON timesheet_days(timesheet_week_id);
CREATE INDEX idx_timesheet_days_date ON timesheet_days(date);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, is_read);
CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id, status);
CREATE INDEX idx_ot_approvals_status ON ot_approvals(status, approver_id);
