-- 086_org_chart_view.sql
-- Creates a non-sensitive read-only view of the org chart visible to all
-- authenticated users.  Omits email, phone, ID numbers, passport details,
-- and certifications.  Used by the Organogram tab which is now accessible
-- to all employees (not just supervisors/managers).
--
-- RLS bypass: the view is owned by `postgres` (a BYPASSRLS superuser).
-- When an `authenticated` session queries the view, PostgreSQL executes the
-- underlying query in the view owner's context, which skips all RLS policies
-- on the `profiles` table.  The `authenticated` role only needs SELECT on the
-- view itself — which is granted below.
--
-- IDEMPOTENCY: CREATE OR REPLACE + GRANT + ALTER OWNER are safe to re-run.

CREATE OR REPLACE VIEW public.org_chart_view AS
SELECT
  p.id,
  p.first_name,
  p.surname,
  p.job_title,
  p.decision_level,
  p.employee_code,
  p.status,
  p.supervisor_id,
  s.name  AS site_name,
  d.name  AS department_name
FROM   profiles    p
LEFT JOIN sites       s ON s.id = p.site_id
LEFT JOIN departments d ON d.id = p.department_id
WHERE  p.status = 'active';

-- Ensure the view is owned by postgres so it runs with BYPASSRLS privileges
ALTER VIEW public.org_chart_view OWNER TO postgres;

-- Allow every signed-in user to read the view
GRANT SELECT ON public.org_chart_view TO authenticated;
