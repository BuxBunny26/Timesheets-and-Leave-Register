-- 030_leave_calendar_view.sql
-- Company-wide calendar of approved leave + helper for the dashboard widget.
-- Exposes only safe fields (no reasons / supervisor comments / balances).
-- Uses security_invoker = false so the view runs with the owner's privileges
-- and bypasses leave_requests / profiles RLS for this limited, safe projection.

CREATE OR REPLACE VIEW approved_leave_calendar
WITH (security_invoker = false) AS
SELECT
  lr.id,
  lr.employee_id,
  lr.leave_type,
  lr.start_date,
  lr.end_date,
  lr.total_days,
  p.first_name,
  p.surname,
  p.site_id,
  s.name AS site_name,
  p.supervisor_id
FROM leave_requests lr
JOIN profiles p ON p.id = lr.employee_id
LEFT JOIN sites s ON s.id = p.site_id
WHERE lr.status = 'approved';

GRANT SELECT ON approved_leave_calendar TO authenticated;

-- Optional: speed up range queries on leave_requests by status + start_date.
CREATE INDEX IF NOT EXISTS idx_leave_requests_status_start
  ON leave_requests (status, start_date);
