-- 064_title_email_site_fixes.sql
-- Corrects job titles, email mismatches from migration 062/063, adds
-- Middleburg site, and fixes Leané's site and supervisor lookups
-- that failed due to wrong email variants.

-- ============================================================
-- 1. ADD MIDDLEBURG SITE for Leané Bodenstein
-- ============================================================
INSERT INTO sites (code, name, city, province, country_code)
VALUES ('SA-MDB', 'Middleburg', 'Middleburg', 'Mpumalanga', 'ZA')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. FIX LEANÉ'S SITE (was incorrectly showing Mozambique)
-- ============================================================
UPDATE profiles
  SET site_id = (SELECT id FROM sites WHERE code = 'SA-MDB')
  WHERE LOWER(email) = 'leane@wearcheckrs.com';

-- ============================================================
-- 3. CORRECTED JOB TITLES (updated list from user)
--    Uses IN() to catch both old and new email variants
-- ============================================================

-- Ailwel: Technologist → Technician
UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'marshallr@wearcheckrs.com';

-- Chicco: Technician → Technologist
UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'chicco@wearcheckrs.com';

-- André Erasmus (email changed: andree@wearcheckrs.com → andree@wearcheck.co.za)
UPDATE profiles SET job_title = 'Machinery Inspector / Auditor'
  WHERE LOWER(email) IN ('andree@wearcheckrs.com', 'andree@wearcheck.co.za');

-- Aubrey: Reliability Technologist
UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'aubrey@wearcheckrs.com';

-- David Lipague (email changed: davidi@ → davidl@)
UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) IN ('davidi@wearcheckrs.com', 'davidl@wearcheckrs.com');

-- Daniel Greef Meintjies (email changed: greefm@wearcheckrs.com → greeffm@wearcheck.co.za)
UPDATE profiles SET job_title = 'Machine Inspector Level 2 Mech'
  WHERE LOWER(email) IN ('greefm@wearcheckrs.com', 'greeffm@wearcheck.co.za');

-- Ethel Mienie (email corrected: ethel.milenie@ → ethel.mienie@)
UPDATE profiles SET job_title = 'Administration Assistant'
  WHERE LOWER(email) IN ('ethel.milenie@wearcheckrs.com', 'ethel.mienie@wearcheckrs.com');

-- Evert Viljoen (email changed: evert@wearcheckrs.co.za → evertv@wearcheck.co.za)
UPDATE profiles SET job_title = 'Machine Inspector Level 2 NDT'
  WHERE LOWER(email) IN ('evert@wearcheckrs.co.za', 'evertv@wearcheck.co.za');

-- Francios Pretorius: was "Reliability Analyst - Site Supervisor", now "Roslyn Co-ordinator"
UPDATE profiles SET job_title = 'Roslyn Co-ordinator'
  WHERE LOWER(email) = 'franciosp@wearcheckrs.com';

-- Francois van Eeden (email changed: francoive@ → francoisve@)
UPDATE profiles SET job_title = 'Reliability Analyst Vibration'
  WHERE LOWER(email) IN ('francoive@wearcheckrs.com', 'francoisve@wearcheckrs.com');

-- Freddy Hoy (email changed: freddish@ → freddieh@; name stays Freddy)
UPDATE profiles SET job_title = 'Machine Inspector Level 1 Mech', first_name = 'Freddy'
  WHERE LOWER(email) IN ('freddish@wearcheck.co.za', 'freddieh@wearcheck.co.za');

-- Jean-Pierre Jordaan (email changed: jeanj@wearcheckrs.com → jeanj@wearcheck.co.za)
UPDATE profiles SET job_title = 'Machine Inspector Level 2 Mech'
  WHERE LOWER(email) IN ('jeanj@wearcheckrs.com', 'jeanj@wearcheck.co.za');

-- Johann Louw (email changed: janniel@wearcheckrs.com → janniel@wearcheck.co.za)
UPDATE profiles SET job_title = 'Machine Inspector Level 2 Mech'
  WHERE LOWER(email) IN ('janniel@wearcheckrs.com', 'janniel@wearcheck.co.za');

-- Johandre Oosthuizen: Reliability Technician
UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'johandre@wearcheckrs.com';

-- Lopi Bernard Molangoane: Technician → Technologist
UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) IN ('lopim@wearcheckrs.com', 'lopim@wearcheck.co.za');

-- Londolani Managa: Reliability Specialist
UPDATE profiles SET job_title = 'Reliability Specialist'
  WHERE LOWER(email) IN ('londolanim@wearcheckrs.com', 'londolain@wearcheckrs.com');

-- Mariette du Rand: fix missing space "ReliabilityTechnologist" → proper title
UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'mariette@wearcheckrs.com';

-- Reinier Kalp (email corrected: reinlerk@ → reinierk@)
UPDATE profiles SET job_title = 'Reliability Analyst Vibration'
  WHERE LOWER(email) IN ('reinlerk@wearcheckrs.com', 'reinierk@wearcheckrs.com');

-- Roger Henwood (email changed: rogert@ → rogerh@; title updated)
UPDATE profiles SET job_title = 'RCA Operations Manager'
  WHERE LOWER(email) IN ('rogert@wearcheckrs.com', 'rogerh@wearcheckrs.com');

-- Tonny Simelani: Technician → Technologist
UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'tonny@wearcheckrs.com';

-- Tsietsi Monnanyane: Technician → Technologist
UPDATE profiles SET job_title = 'Precision Maintenance Technologist'
  WHERE LOWER(email) = 'tsietsi@wearcheckrs.com';

-- Micheal Masemola: Technologist
UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'michealm@wearcheckrs.com';

-- ============================================================
-- 4. FIX SUPERVISOR LOOKUPS that failed due to wrong emails
--    Roger Henwood (rogert@ vs rogerh@) → Heinrich and Kevin had NULL supervisor
-- ============================================================

-- Heinrich Kusel → Roger Henwood (try both email variants)
UPDATE profiles
  SET supervisor_id = (
    SELECT id FROM profiles
    WHERE LOWER(email) IN ('rogerh@wearcheckrs.com', 'rogert@wearcheckrs.com')
    LIMIT 1
  )
  WHERE LOWER(email) = 'heinrich@wearcheckrs.com';

-- Kevin Henwood → Roger Henwood
UPDATE profiles
  SET supervisor_id = (
    SELECT id FROM profiles
    WHERE LOWER(email) IN ('rogerh@wearcheckrs.com', 'rogert@wearcheckrs.com')
    LIMIT 1
  )
  WHERE LOWER(email) = 'kevin@wearcheckrs.com';

-- Also re-run supervisor for Francois van Eeden → Andrew Robb (email changed)
UPDATE profiles
  SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email) = 'andrew@wearcheckrs.com')
  WHERE LOWER(email) IN ('francoive@wearcheckrs.com', 'francoisve@wearcheckrs.com');

-- Re-run supervisor for anyone whose supervisor lookup used londolanim vs londolain
-- (covers the case where DB still has the old email variant)
UPDATE profiles
  SET supervisor_id = (
    SELECT id FROM profiles
    WHERE LOWER(email) IN ('londolanim@wearcheckrs.com', 'londolain@wearcheckrs.com')
    LIMIT 1
  )
  WHERE LOWER(email) IN (
    'annahm@wearcheckrs.com', 'chicco@wearcheckrs.com', 'leon@wearcheckrs.com',
    'lopim@wearcheckrs.com', 'lopim@wearcheck.co.za', 'michealm@wearcheckrs.com',
    'percy@wearcheckrs.com', 'siphom@wearcheckrs.com'
  );
