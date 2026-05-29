-- 058_seed_start_dates.sql
-- Seeds known employee start dates into employee_details, matched by employee_code
-- on the profiles table.  Uses INSERT ... ON CONFLICT to upsert only start_date
-- so no other fields are overwritten.

DO $$
DECLARE
  v_code   TEXT;
  v_date   DATE;
  v_emp_id UUID;
BEGIN
  FOR v_code, v_date IN VALUES
    ('WC484',   DATE '2019-06-01'),
    ('WEC052',  DATE '2018-08-01'),
    ('WEC090',  DATE '2021-01-01'),
    ('WC497',   DATE '2012-08-01'),
    ('WEC080',  DATE '2020-08-01'),
    ('WC491',   DATE '1983-01-01'),
    ('WEC102',  DATE '2021-09-01'),
    ('WEC113',  DATE '2022-03-01'),
    ('WC382',   DATE '2024-06-02'),
    ('WEC127',  DATE '2024-02-01')
  LOOP
    -- Trim whitespace from stored codes (some have trailing spaces in the sheet)
    SELECT id INTO v_emp_id
    FROM profiles
    WHERE TRIM(employee_code) = TRIM(v_code)
    LIMIT 1;

    IF v_emp_id IS NULL THEN
      RAISE NOTICE 'No profile found for employee_code: %', v_code;
      CONTINUE;
    END IF;

    -- Ensure an employee_details row exists, then set start_date
    INSERT INTO employee_details (employee_id, start_date)
    VALUES (v_emp_id, v_date)
    ON CONFLICT (employee_id) DO UPDATE
      SET start_date = EXCLUDED.start_date,
          updated_at = now();

    RAISE NOTICE 'Set start_date = % for employee_code %', v_date, v_code;
  END LOOP;
END;
$$;
