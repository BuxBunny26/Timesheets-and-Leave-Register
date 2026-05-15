-- Leave Requests
CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES profiles(id),
  leave_type TEXT NOT NULL
    CHECK (leave_type IN ('annual','sick','family','study','unpaid','other')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied','cancelled')),
  supervisor_id UUID REFERENCES profiles(id),
  supervisor_comment TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  actioned_at TIMESTAMPTZ
);
