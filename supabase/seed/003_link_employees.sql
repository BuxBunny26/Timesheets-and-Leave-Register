-- Run this AFTER all auth users have been created and profiles auto-populated
-- This updates profiles with org structure data

-- =====================
-- PASS 1: Set org structure fields for each employee
-- =====================

-- Example for Philip Schutte (WC253) - top-level manager
UPDATE profiles SET
  employee_code = 'WC253',
  first_name = 'Philip',
  surname = 'Schutte',
  role = 'manager',
  division_id = (SELECT id FROM divisions WHERE code = 'ARC'),
  department_id = (SELECT id FROM departments WHERE code = 'ARC-RCM'),
  payment_centre_id = (SELECT id FROM payment_centres WHERE code = 'WEARCHECK'),
  site_id = (SELECT id FROM sites WHERE code = 'SA-HO'),
  supervisor_id = NULL
WHERE email = 'philip@wearcheckrs.com';

UPDATE profiles SET
  employee_code = 'WC319',
  first_name = 'Annemie',
  surname = 'Willer',
  role = 'manager',
  division_id = (SELECT id FROM divisions WHERE code = 'ARC'),
  department_id = (SELECT id FROM departments WHERE code = 'ARC-RCM'),
  payment_centre_id = (SELECT id FROM payment_centres WHERE code = 'WEARCHECK'),
  site_id = (SELECT id FROM sites WHERE code = 'SA-HO')
WHERE email = 'annemie@wearcheckrs.com';

UPDATE profiles SET
  employee_code = 'WC352',
  first_name = 'Jaco',
  surname = 'Willer',
  role = 'manager',
  division_id = (SELECT id FROM divisions WHERE code = 'ARC'),
  department_id = (SELECT id FROM departments WHERE code = 'ARC-RCM'),
  payment_centre_id = (SELECT id FROM payment_centres WHERE code = 'WEARCHECK'),
  site_id = (SELECT id FROM sites WHERE code = 'SA-HO')
WHERE email = 'jaco@wearcheckrs.com';

UPDATE profiles SET
  employee_code = 'WC508',
  first_name = 'Johan',
  surname = 'Stols',
  role = 'manager',
  division_id = (SELECT id FROM divisions WHERE code = 'AFS'),
  department_id = (SELECT id FROM departments WHERE code = 'AFS-TC'),
  payment_centre_id = (SELECT id FROM payment_centres WHERE code = 'WEARCHECK'),
  site_id = (SELECT id FROM sites WHERE code = 'SA-HO')
WHERE email = 'Johans@wearcheckrs.com';

UPDATE profiles SET
  employee_code = 'WC504',
  first_name = 'Roger',
  surname = 'Henwood',
  role = 'manager',
  division_id = (SELECT id FROM divisions WHERE code = 'AFS'),
  department_id = (SELECT id FROM departments WHERE code = 'AFS-RCA'),
  payment_centre_id = (SELECT id FROM payment_centres WHERE code = 'WEARCHECK'),
  site_id = (SELECT id FROM sites WHERE code = 'SA-HO')
WHERE email = 'rogerh@wearcheckrs.com';

UPDATE profiles SET
  employee_code = 'WC492',
  first_name = 'Adri',
  surname = 'Ludick',
  role = 'manager',
  division_id = (SELECT id FROM divisions WHERE code = 'AFS'),
  department_id = (SELECT id FROM departments WHERE code = 'AFS-NDT'),
  payment_centre_id = (SELECT id FROM payment_centres WHERE code = 'WEARCHECK'),
  site_id = (SELECT id FROM sites WHERE code = 'SA-HO')
WHERE email = 'a.ludick@wearcheckrs.com';

-- =====================
-- PASS 2: Set supervisor_ids (after all employees are updated above)
-- =====================

-- WC253 (Philip Schutte) reports to no one - already set to NULL in Pass 1

-- Direct reports of WC253 (Philip Schutte)
UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE employee_code = 'WC253')
WHERE employee_code IN ('WC319', 'WC352', 'WC508', 'WC504', 'WC492');

-- Continue this pattern for all supervisor relationships based on full employee list
-- (Add additional UPDATE statements here for the complete employee roster)
