-- 085_gp_consult_seed_study_balances.sql
-- Migration 084 updated existing study leave_balances rows to 10 days,
-- but GP Consult employees who have never submitted a study leave request
-- have no row to update.  This migration inserts the missing rows.
--
-- Strategy: for each GP Consult employee, for every financial year in which
-- they already have an annual/sick/family balance, upsert a study balance row
-- with total_days = 10.  The ON CONFLICT clause also corrects any rows that
-- were previously seeded with 0 days.
--
-- IDEMPOTENT: safe to re-run.

INSERT INTO leave_balances (employee_id, leave_type, year, total_days, used_days)
SELECT DISTINCT
  lb.employee_id,
  'study',
  lb.year,
  10,
  0
FROM leave_balances lb
JOIN profiles       p  ON p.id  = lb.employee_id
JOIN payment_centres pc ON pc.id = p.payment_centre_id
WHERE pc.code        = 'GP_CONSULT'
  AND lb.leave_type != 'study'
ON CONFLICT (employee_id, leave_type, year) DO UPDATE
  SET total_days = 10,
      updated_at = NOW()
WHERE leave_balances.total_days < 10;
