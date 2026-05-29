-- 051_birthdays.sql
-- Adds id_number to employee_details and helpers for birthday features.
-- SA ID format: YYMMDDGGGGSAZ (first 6 digits = date of birth)

-- ============================================================
-- 1. Add id_number column to employee_details
-- ============================================================
ALTER TABLE employee_details ADD COLUMN IF NOT EXISTS id_number TEXT;

-- ============================================================
-- 2. IMMUTABLE helper: extract date-of-birth from SA ID number
--    Rules: YY <= current 2-digit year → 2000s, else 1900s
--    Returns NULL on any parse failure (non-SA IDs, blanks, etc.)
-- ============================================================
CREATE OR REPLACE FUNCTION extract_dob_from_sa_id(p_id TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  yy   INT;
  mm   INT;
  dd   INT;
  yr   INT;
  cur2 INT;
BEGIN
  IF p_id IS NULL OR length(trim(p_id)) < 6 THEN RETURN NULL; END IF;
  BEGIN
    yy := substring(trim(p_id), 1, 2)::INT;
    mm := substring(trim(p_id), 3, 2)::INT;
    dd := substring(trim(p_id), 5, 2)::INT;
  EXCEPTION WHEN OTHERS THEN RETURN NULL;
  END;
  cur2 := EXTRACT(YEAR FROM CURRENT_DATE)::INT % 100;
  yr := CASE WHEN yy <= cur2 THEN 2000 + yy ELSE 1900 + yy END;
  BEGIN
    RETURN make_date(yr, mm, dd);
  EXCEPTION WHEN OTHERS THEN RETURN NULL;
  END;
END;
$$;

-- ============================================================
-- 3. View: birthdays_this_year
--    Joins profiles + employee_details, exposes DOB and this-year
--    birthday date so the app can filter by month / today easily.
--    Respects active status; does NOT expose full id_number.
-- ============================================================
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
  -- derive DOB from SA ID stored in employee_details
  extract_dob_from_sa_id(ed.id_number)  AS date_of_birth,
  -- birthday this calendar year (may be past or future)
  make_date(
    EXTRACT(YEAR FROM CURRENT_DATE)::INT,
    EXTRACT(MONTH FROM extract_dob_from_sa_id(ed.id_number))::INT,
    EXTRACT(DAY   FROM extract_dob_from_sa_id(ed.id_number))::INT
  )                                      AS birthday_this_year,
  -- age they will turn this calendar year
  EXTRACT(YEAR FROM CURRENT_DATE)::INT
    - EXTRACT(YEAR FROM extract_dob_from_sa_id(ed.id_number))::INT AS turning_age
FROM profiles p
LEFT JOIN employee_details ed ON ed.employee_id = p.id
WHERE
  p.status = 'active'
  AND ed.id_number IS NOT NULL
  AND ed.id_number <> ''
  AND extract_dob_from_sa_id(ed.id_number) IS NOT NULL;

-- Grant authenticated users access to the view (RLS is on the base tables)
GRANT SELECT ON birthdays_this_year TO authenticated;
