-- 053_birthdays_privacy.sql
-- Removes date_of_birth and turning_age from the birthdays_this_year view.
-- Only day + month is now exposed, keeping birth year private.

DROP VIEW IF EXISTS birthdays_this_year;
CREATE VIEW birthdays_this_year AS
SELECT
  p.id            AS employee_id,
  p.first_name,
  p.surname,
  p.employee_code,
  p.site_id,
  p.department_id,
  p.supervisor_id,
  p.status,
  -- birthday this calendar year (may be past or future) — no birth year exposed
  make_date(
    EXTRACT(YEAR FROM CURRENT_DATE)::INT,
    EXTRACT(MONTH FROM extract_dob_from_sa_id(ed.id_number))::INT,
    EXTRACT(DAY   FROM extract_dob_from_sa_id(ed.id_number))::INT
  ) AS birthday_this_year
FROM profiles p
LEFT JOIN employee_details ed ON ed.employee_id = p.id
WHERE
  p.status = 'active'
  AND ed.id_number IS NOT NULL
  AND ed.id_number <> ''
  AND extract_dob_from_sa_id(ed.id_number) IS NOT NULL;

GRANT SELECT ON birthdays_this_year TO authenticated;
