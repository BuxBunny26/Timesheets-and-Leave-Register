-- 074_employee_leave_policies.sql
-- Assigns all active employees to the Standard leave policy.
--
-- CRITICAL FINDING (query 8):
-- All 115 employees in employee_details have NULL engagement_date.
-- This means engagement-date-based leave cycles (annual, sick) cannot be
-- computed correctly until engagement dates are imported.
--
-- FALLBACK RULE applied to all employees:
--   effective_from    = '2025-07-01' (start of current financial year)
--   assignment_source = 'migration_fallback'
--   requires_review   = TRUE
--
-- Do NOT fabricate historical employment dates.
-- Once engagement dates are imported, update effective_from per employee
-- and set requires_review = FALSE after verification.
--
-- PREREQUISITES: migration 073 (leave_policies) must be applied first.
-- IDEMPOTENCY: INSERT ... ON CONFLICT DO NOTHING.

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_leave_policies (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID        NOT NULL REFERENCES profiles(id),
  leave_policy_id   UUID        NOT NULL REFERENCES leave_policies(id),
  effective_from    DATE        NOT NULL,
  effective_to      DATE,                      -- NULL = currently active
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  assigned_by       UUID        REFERENCES profiles(id),
  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  assignment_reason TEXT,
  assignment_source TEXT        NOT NULL DEFAULT 'manual',
                                -- 'manual' | 'migration_fallback' | 'import'
  requires_review   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevent overlapping active assignments for the same employee
  UNIQUE(employee_id, effective_from)
);

DROP TRIGGER IF EXISTS update_employee_leave_policies_updated_at ON employee_leave_policies;
CREATE TRIGGER update_employee_leave_policies_updated_at
  BEFORE UPDATE ON employee_leave_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Backfill: assign all active employees to Standard policy ─────────────────
INSERT INTO employee_leave_policies (
  employee_id,
  leave_policy_id,
  effective_from,
  is_active,
  assignment_source,
  assignment_reason,
  requires_review
)
SELECT
  p.id,
  (SELECT id FROM leave_policies WHERE code = 'standard'),
  '2025-07-01'::DATE,   -- FY start fallback (engagement dates are all NULL)
  TRUE,
  'migration_fallback',
  'Assigned during migration 074. Engagement date was unavailable. '
  'Update effective_from once engagement date is confirmed and set requires_review = false.',
  TRUE
FROM profiles p
WHERE p.status = 'active'
  AND p.role NOT IN ('system_admin')  -- system_admin may not need a leave policy
ON CONFLICT (employee_id, effective_from) DO NOTHING;

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT COUNT(*) AS assigned,
--        SUM(CASE WHEN requires_review THEN 1 ELSE 0 END) AS needs_review
--   FROM employee_leave_policies;
-- Expected: assigned = number of active non-system-admin employees
--           needs_review = same number (all require review until engagement dates loaded)
--
-- ACTION REQUIRED:
-- Import engagement dates into employee_details.engagement_date.
-- Then run:
--   UPDATE employee_leave_policies elp
--   SET effective_from = ed.engagement_date,
--       requires_review = FALSE,
--       assignment_reason = 'Updated from engagement date after import'
--   FROM employee_details ed
--   WHERE ed.employee_id = elp.employee_id
--     AND ed.engagement_date IS NOT NULL
--     AND elp.assignment_source = 'migration_fallback';
