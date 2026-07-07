-- 062_job_titles_and_organogram.sql
-- 1. Update job titles for all employees to match the master spreadsheet.
-- 2. Move Mariette du Rand to report under Edward Pieterse (Senior)
--    and set her title to Reliability Technician.
--
-- Matches are done by email (case-insensitive) so safe to re-run.
-- Only rows whose email exists in profiles will be updated.

-- ============================================================
-- 1. Job title updates (alphabetical by first name)
-- ============================================================
UPDATE profiles SET job_title = 'Manager Mechanical'
  WHERE LOWER(email) = 'a.ludick@wearcheckrs.com';

UPDATE profiles SET job_title = 'Thermal Manager'
  WHERE LOWER(email) = 'adriaanb@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'marshallr@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'alex@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist - Site Supervisor'
  WHERE LOWER(email) = 'allan@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machinery Inspector / Auditor'
  WHERE LOWER(email) = 'andree@wearcheckrs.com';

UPDATE profiles SET job_title = 'ARC Centre Manager'
  WHERE LOWER(email) = 'andrew@wearcheckrs.com';

UPDATE profiles SET job_title = 'Divisional Manager'
  WHERE LOWER(email) = 'annemie@wearcheckrs.com';

UPDATE profiles SET job_title = 'Co-ordinator Steelport'
  WHERE LOWER(email) = 'annahm@wearcheckrs.com';

UPDATE profiles SET job_title = 'RCA Inspector'
  WHERE LOWER(email) = 'antonio.ehrke@wearcheckrs.com';

UPDATE profiles SET job_title = 'Site Supervisor'
  WHERE LOWER(email) = 'armindo@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 1 TC'
  WHERE LOWER(email) = 'arnold@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'aubrey@wearcheckrs.com';

UPDATE profiles SET job_title = 'Administrator'
  WHERE LOWER(email) = 'bianka@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'boitumeio@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'chicco@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Specialist'
  WHERE LOWER(email) = 'chrism@wearcheckrs.com';

UPDATE profiles SET job_title = 'RS Corporate Travel Admin'
  WHERE LOWER(email) = 'christene@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'cj@wearcheckrs.com';

UPDATE profiles SET job_title = 'Administration Assistant'
  WHERE LOWER(email) = 'colleen.pyper@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 Mech'
  WHERE LOWER(email) = 'greefm@wearcheckrs.com';

UPDATE profiles SET job_title = 'Oil Sampling Administrator'
  WHERE LOWER(email) = 'daniel@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Specialist'
  WHERE LOWER(email) = 'david@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'davidi@wearcheckrs.com';

UPDATE profiles SET job_title = 'Mpumalanga Co-ordinator'
  WHERE LOWER(email) = 'deon@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'desmond@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'dian@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'douglas@wearcheckrs.com';

UPDATE profiles SET job_title = 'Level 1 - NDT Inspector'
  WHERE LOWER(email) = 'dyllen@wearcheckrs.com';

UPDATE profiles SET job_title = 'Site Co-ordinator Anglo Smelters'
  WHERE LOWER(email) = 'eben@wearcheckrs.com';

UPDATE profiles SET job_title = 'Operations Manager'
  WHERE LOWER(email) = 'edwardp@wearcheckrs.com';

UPDATE profiles SET job_title = 'ARC TC Machinery Inspector'
  WHERE LOWER(email) = 'edwin@wearcheckrs.com';

UPDATE profiles SET job_title = 'Administration Assistant'
  WHERE LOWER(email) = 'ethel.milenie@wearcheckrs.com';

UPDATE profiles SET job_title = 'Gauteng Co-ordinator'
  WHERE LOWER(email) = 'epieterse@wearcheckrs.com';

UPDATE profiles SET job_title = 'Precision Maintenance Technologist'
  WHERE LOWER(email) = 'eugene@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 NDT'
  WHERE LOWER(email) = 'evert@wearcheckrs.co.za';

UPDATE profiles SET job_title = 'Roslyn Co-ordinator'
  WHERE LOWER(email) = 'franciosp@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Analyst Vibration'
  WHERE LOWER(email) = 'francoisve@wearcheckrs.com';

UPDATE profiles SET job_title = 'KZN Co-ordinator'
  WHERE LOWER(email) = 'francoisp@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'freddy-ben@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'gabriel@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 TC'
  WHERE LOWER(email) = 'godfreyb@wearcheck.co.za';

UPDATE profiles SET job_title = 'Machine Inspector Level 1 Mech'
  WHERE LOWER(email) = 'freddyh@wearcheck.co.za';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'gustav@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'hannest@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Analyst'
  WHERE LOWER(email) = 'heinc@wearcheckrs.com';

UPDATE profiles SET job_title = 'Rope Inspector'
  WHERE LOWER(email) = 'heinrichi@wearcheckrs.com';

UPDATE profiles SET job_title = 'Level 2 Inspector'
  WHERE LOWER(email) = 'henry@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'isa@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 NDT'
  WHERE LOWER(email) = 'jacov@wearcheck.co.za';

UPDATE profiles SET job_title = 'Foreign Ops BU Manager'
  WHERE LOWER(email) = 'jaco@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'james@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 NDT'
  WHERE LOWER(email) = 'janb@wearcheck.co.za';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 Mech'
  WHERE LOWER(email) = 'janniel@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'jj@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 1 TC'
  WHERE LOWER(email) = 'johanb@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 1 TC'
  WHERE LOWER(email) = 'johanr@wearcheckrs.com';

UPDATE profiles SET job_title = 'ARC TC Manager'
  WHERE LOWER(email) = 'johans@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'johandra@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 TC'
  WHERE LOWER(email) = 'josephk@wearcheck.co.za';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 Mech'
  WHERE LOWER(email) = 'jeanj@wearcheckrs.com';

UPDATE profiles SET job_title = 'Diagnostician Trainee'
  WHERE LOWER(email) = 'leane@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 TC'
  WHERE LOWER(email) = 'kevin@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 Mech'
  WHERE LOWER(email) = 'khotso@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'leon@wearcheckrs.com';

UPDATE profiles SET job_title = 'Integration Specialist'
  WHERE LOWER(email) = 'lesego@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 NDT'
  WHERE LOWER(email) = 'lorraine@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Specialist'
  WHERE LOWER(email) = 'londolain@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'lopim@wearcheckrs.com';

UPDATE profiles SET job_title = 'Technical & Training Manager'
  WHERE LOWER(email) = 'louis@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist - Site Supervisor'
  WHERE LOWER(email) = 'lubby@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'laas@wearcheckrs.com';

UPDATE profiles SET job_title = 'RS Invoicing Administrator'
  WHERE LOWER(email) = 'mand@wearcheckrs.com';

UPDATE profiles SET job_title = 'Sales Manager'
  WHERE LOWER(email) = 'marcel@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'mariette@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'martiens@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 1 Mech'
  WHERE LOWER(email) = 'mikes@wearcheckrs.com';

UPDATE profiles SET job_title = 'Administration Manager'
  WHERE LOWER(email) = 'megan@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 TC'
  WHERE LOWER(email) = 'mervyng@wearcheck.co.za';

UPDATE profiles SET job_title = 'Reliability Analyst - Site Supervisor'
  WHERE LOWER(email) = 'micheal@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'michealm@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'betty@wearcheckrs.com';

UPDATE profiles SET job_title = 'Precision Maintenance Technologist'
  WHERE LOWER(email) = 'mornea@wearcheckrs.com';

UPDATE profiles SET job_title = 'Integration Co-Ordinator'
  WHERE LOWER(email) = 'nadhira@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 RCA'
  WHERE LOWER(email) = 'nico.duplessis@wearcheckrs.com';

UPDATE profiles SET job_title = 'Samancor Co-ordinator'
  WHERE LOWER(email) = 'lloyd@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Specialist'
  WHERE LOWER(email) = 'nomvulam@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machinery Inspector'
  WHERE LOWER(email) = 'landus@wearcheckrs.com';

UPDATE profiles SET job_title = 'Sampler'
  WHERE LOWER(email) = 'passwell@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machinery Inspector'
  WHERE LOWER(email) = 'patrick@wearcheckrs.com';

UPDATE profiles SET job_title = 'Service Manager'
  WHERE LOWER(email) = 'peet@wearcheckrs.com';

UPDATE profiles SET job_title = 'Precision Maintenance Technologist'
  WHERE LOWER(email) = 'percy@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'permission@wearcheckrs.com';

UPDATE profiles SET job_title = 'General Manager'
  WHERE LOWER(email) = 'philip@wearcheckrs.com';

UPDATE profiles SET job_title = 'Senior Technician'
  WHERE LOWER(email) = 'placido@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Analyst Vibration'
  WHERE LOWER(email) = 'reinlerk@wearcheckrs.com';

UPDATE profiles SET job_title = 'Mozambique - Country Manager'
  WHERE LOWER(email) = 'riaandp@wearcheckrs.com';

UPDATE profiles SET job_title = 'RBMR Co-ordinator'
  WHERE LOWER(email) = 'riaardb@wearcheckrs.com';

UPDATE profiles SET job_title = 'RCM/RCA Manager'
  WHERE LOWER(email) = 'rogert@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'rakeal@wearcheckrs.com';

UPDATE profiles SET job_title = 'Site Manager'
  WHERE LOWER(email) = 'rohan@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'rynhardt@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 RCA'
  WHERE LOWER(email) = 'rynhardt.smit@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'sergent@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 1 TC'
  WHERE LOWER(email) = 'shaun@wearcheckrs.com';

UPDATE profiles SET job_title = 'RS Administrator'
  WHERE LOWER(email) = 'shivon@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'simon@wearcheckrs.com';

UPDATE profiles SET job_title = 'Machine Inspector Level 2 NDT'
  WHERE LOWER(email) = 'simondifutso@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'siphoz@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'siphom@wearcheckrs.com';

UPDATE profiles SET job_title = 'Administration Assistant'
  WHERE LOWER(email) = 'teresa.venter@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Specialist'
  WHERE LOWER(email) = 'stephanie@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist Trainee'
  WHERE LOWER(email) = 'thapelo@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technologist'
  WHERE LOWER(email) = 'thomas@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Specialist'
  WHERE LOWER(email) = 'thulani@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'tonny@wearcheckrs.com';

UPDATE profiles SET job_title = 'Precision Maintenance Technician'
  WHERE LOWER(email) = 'tsietsi@wearcheckrs.com';

UPDATE profiles SET job_title = 'Reliability Technician'
  WHERE LOWER(email) = 'wihan@wearcheckrs.com';

-- ============================================================
-- 2. Organogram: Mariette du Rand → reports to Edward Pieterse (Senior)
--    Edward Pieterse Senior = epieterse@wearcheckrs.com (Gauteng Co-ordinator)
--    If this is wrong, run:
--      UPDATE profiles SET supervisor_id = (SELECT id FROM profiles WHERE LOWER(email) = '<correct_email>')
--      WHERE LOWER(email) = 'mariette@wearcheckrs.com';
-- ============================================================
UPDATE profiles
SET supervisor_id = (
  SELECT id FROM profiles WHERE LOWER(email) = 'epieterse@wearcheckrs.com'
)
WHERE LOWER(email) = 'mariette@wearcheckrs.com'
  AND (SELECT id FROM profiles WHERE LOWER(email) = 'epieterse@wearcheckrs.com') IS NOT NULL;
