-- 087_org_corrections.sql
-- Data corrections to organogram reporting lines and departments.
--
-- Changes:
--   1. Daniel Molapo  → department: Reliability Services (was Administration)
--   2. JJ de Beer     → supervisor: Andrew Robb, department: Remote Centre
--   3. Lucas (*)      → supervisor: Andrew Robb
--   4. Morne Alberts  → supervisor: Andrew Robb
--   5. Adds 'Executives' department and assigns all profiles where
--      decision_level = 'Executive' to it.
--
-- IDEMPOTENCY: uses UPDATE ... WHERE; INSERT ... ON CONFLICT DO UPDATE.

-- ── 1. Daniel Molapo: correct department to Reliability Services ──────────────
UPDATE profiles
SET department_id = (SELECT id FROM departments WHERE code = 'ORG-RS' LIMIT 1)
WHERE first_name = 'Daniel'
  AND surname    = 'Molapo'
  AND status     = 'active';

-- ── 2. JJ de Beer: supervisor → Andrew Robb, department → Remote Centre ───────
UPDATE profiles
SET
  supervisor_id = (
    SELECT id FROM profiles
    WHERE first_name = 'Andrew' AND surname = 'Robb' AND status = 'active'
    LIMIT 1
  ),
  department_id = (SELECT id FROM departments WHERE code = 'ORG-RC' LIMIT 1)
WHERE first_name = 'JJ'
  AND surname    = 'de Beer'
  AND status     = 'active';

-- ── 3. Lucas: supervisor → Andrew Robb ────────────────────────────────────────
UPDATE profiles
SET supervisor_id = (
  SELECT id FROM profiles
  WHERE first_name = 'Andrew' AND surname = 'Robb' AND status = 'active'
  LIMIT 1
)
WHERE first_name = 'Lucas'
  AND status     = 'active';

-- ── 4. Morne Alberts: supervisor → Andrew Robb ────────────────────────────────
UPDATE profiles
SET supervisor_id = (
  SELECT id FROM profiles
  WHERE first_name = 'Andrew' AND surname = 'Robb' AND status = 'active'
  LIMIT 1
)
WHERE first_name = 'Morne'
  AND surname    = 'Alberts'
  AND status     = 'active';

-- ── 5. Deon: job title → Mpumalanga Co-Ordinator ─────────────────────────────
UPDATE profiles
SET job_title = 'Mpumalanga Co-Ordinator'
WHERE first_name = 'Deon'
  AND status     = 'active';

-- ── 6. Add Executives department ──────────────────────────────────────────────
-- Creates the department so it appears in the organogram department filter.
-- Employees are NOT bulk-moved here — executives retain their own departments
-- (e.g. Louis stays in Digital).  Use the "All levels → Executive" filter on
-- the organogram to view executives across all departments.
INSERT INTO departments (code, name, division_code)
VALUES ('ORG-EXEC', 'Executives', NULL)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- ── Verification ──────────────────────────────────────────────────────────────
-- SELECT first_name, surname, department_id,
--        (SELECT name FROM departments WHERE id = profiles.department_id) AS dept,
--        (SELECT first_name || ' ' || surname FROM profiles sup WHERE sup.id = profiles.supervisor_id) AS supervisor
-- FROM profiles
-- WHERE first_name IN ('Daniel','JJ','Lucas','Morne') AND status = 'active'
-- ORDER BY first_name;
--
-- SELECT first_name, surname, decision_level,
--        (SELECT name FROM departments WHERE id = profiles.department_id) AS dept
-- FROM profiles WHERE decision_level = 'Executive' AND status = 'active';
