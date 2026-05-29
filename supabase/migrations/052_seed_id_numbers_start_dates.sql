-- 052_seed_id_numbers_start_dates.sql
-- Populates employee_details.id_number and start_date from the
-- "Employees Details - Standardisation in Progress" spreadsheet.
-- Matches by email (case-insensitive) then employee_code.
-- UPSERTs only rows where the profile already exists in profiles.
-- Generated automatically from the HR spreadsheet.

DO $$
DECLARE v_id UUID;
BEGIN

  -- WC492 / a.ludick@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('a.ludick@wearcheckrs.com')
     OR employee_code = 'WC492'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6005175057085', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6005175057085',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC383 / adriaanb@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('adriaanb@wearcheckrs.com')
     OR employee_code = 'WC383'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8611215135084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8611215135084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC094 / marshallr@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('marshallr@wearcheckrs.com')
     OR employee_code = 'WEC094'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8108185912089', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8108185912089',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC105 / alex@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('alex@wearcheckrs.com')
     OR employee_code = 'WEC105'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9707265013087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9707265013087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC123 / allan@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('allan@wearcheckrs.com')
     OR employee_code = 'WEC123'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8609235207081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8609235207081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC511 / andree@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('andree@wearcheck.co.za')
     OR employee_code = 'WC511'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6103125020087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6103125020087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC103 / andrew@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('andrew@wearcheckrs.com')
     OR employee_code = 'WEC103'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7207125137087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7207125137087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC484 / annahm@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('annahm@wearcheckrs.com')
     OR employee_code = 'WC484'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7908170459082', '2019-06-01')
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7908170459082', start_date = '2019-06-01',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC319 / annemie@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('annemie@wearcheckrs.com')
     OR employee_code = 'WC319'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8003060103088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8003060103088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC503 / antonio.ehrke@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('antonio.ehrke@wearcheckrs.com')
     OR employee_code = 'WC503'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6901085119082', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6901085119082',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC526 / arnold@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('arnold@wearcheckrs.com')
     OR employee_code = 'WC526'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7405295182087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7405295182087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC114 / aubrey@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('aubrey@wearcheckrs.com')
     OR employee_code = 'WEC114'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7904015699081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7904015699081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC142 / bianka@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('bianka@wearcheckrs.com')
     OR employee_code = 'WEC142'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '0708100124088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '0708100124088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC052 / boitumelo@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('boitumelo@wearcheckrs.com')
     OR employee_code = 'WEC052'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, NULL, '2018-08-01')
    ON CONFLICT (employee_id) DO UPDATE
      SET start_date = '2018-08-01',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC380 / chicco@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('chicco@wearcheckrs.com')
     OR employee_code = 'WC380'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8903025575082', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8903025575082',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC100 / chrism@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('chrism@wearcheckrs.com')
     OR employee_code = 'WEC100'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7002215026088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7002215026088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC285 / chrstene@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('chrstene@wearcheckrs.com')
     OR employee_code = 'WC285'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7004090042081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7004090042081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC120 / cj@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('cj@wearcheckrs.com')
     OR employee_code = 'WEC120'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9903315321089', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9903315321089',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC486 / colleen.pyper@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('colleen.pyper@wearcheckrs.com')
     OR employee_code = 'WC486'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6706280059086', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6706280059086',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC528 / greeffm@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('greeffm@wearcheck.co.za')
     OR employee_code = 'WC528'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7203265015084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7203265015084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC402 / daniel@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('daniel@wearcheckrs.com')
     OR employee_code = 'WC402'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8705135962088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8705135962088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC081 / david@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('david@wearcheckrs.com')
     OR employee_code = 'WEC081'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9002075146081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9002075146081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC358 / deon@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('deon@wearcheckrs.com')
     OR employee_code = 'WC358'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7803135114080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7803135114080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC086 / desmond@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('desmond@wearcheckrs.com')
     OR employee_code = 'WEC086'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9403076106084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9403076106084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC119 / douglas@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('douglas@wearcheckrs.com')
     OR employee_code = 'WEC119'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9210165162088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9210165162088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC122 / eben@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('eben@wearcheckrs.com')
     OR employee_code = 'WEC122'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8804125135084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8804125135084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC274 / edwardfp@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('edwardfp@wearcheckrs.com')
     OR employee_code = 'WC274'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8911215035080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8911215035080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC138 / edwin@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('edwin@wearcheckrs.com')
     OR employee_code = 'WEC138'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9007185042088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9007185042088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC488 / ethel.mienie@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('ethel.mienie@wearcheckrs.com')
     OR employee_code = 'WC488'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7305280082088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7305280082088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC271 / epieterse@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('epieterse@wearcheckrs.com')
     OR employee_code = 'WC271'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6309235162087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6309235162087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC090 / eugene@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('eugene@wearcheckrs.com')
     OR employee_code = 'WEC090'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8702235026088', '2021-01-01')
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8702235026088', start_date = '2021-01-01',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC497 / evertv@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('evertv@wearcheck.co.za')
     OR employee_code = 'WC497'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8606135070080', '2012-08-01')
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8606135070080', start_date = '2012-08-01',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC080 / franciosp@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('franciosp@wearcheckrs.com')
     OR employee_code = 'WEC080'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6311035008080', '2020-08-01')
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6311035008080', start_date = '2020-08-01',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC287 / francoisve@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('francoisve@wearcheckrs.com')
     OR employee_code = 'WC287'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7011225029081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7011225029081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC111 / francoisp@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('francoisp@wearcheckrs.com')
     OR employee_code = 'WEC111'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9006295007080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9006295007080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC510 / godfreyb@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('godfreyb@wearcheck.co.za')
     OR employee_code = 'WC510'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7310135303085', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7310135303085',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC093 / freddieh@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('freddieh@wearcheck.co.za')
     OR employee_code = 'WEC093'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7306125100085', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7306125100085',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC270 / gustav@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('gustav@wearcheckrs.com')
     OR employee_code = 'WC270'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7211125028080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7211125028080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC047 / hannest@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('hannest@wearcheckrs.com')
     OR employee_code = 'WEC047'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9801055160081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9801055160081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC129 / heinc@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('heinc@wearcheckrs.com')
     OR employee_code = 'WEC129'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7606105047085', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7606105047085',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC134 / heinrich@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('heinrich@wearcheckrs.com')
     OR employee_code = 'WEC134'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9808145071087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9808145071087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC493 / jacov@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('jacov@wearcheck.co.za')
     OR employee_code = 'WC493'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8512065146082', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8512065146082',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC352 / jaco@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('jaco@wearcheckrs.com')
     OR employee_code = 'WC352'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8205175103081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8205175103081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC097 / jacodb@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('jacodb@wearcheckrs.com')
     OR employee_code = 'WEC097'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8705055104083', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8705055104083',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC236 / james@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('james@wearcheckrs.com')
     OR employee_code = 'WC236'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8504216014087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8504216014087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC496 / janb@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('janb@wearcheck.co.za')
     OR employee_code = 'WC496'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6802275012089', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6802275012089',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC494 / janniel@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('janniel@wearcheck.co.za')
     OR employee_code = 'WC494'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6308035105080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6308035105080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC137 / jj@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('jj@wearcheckrs.com')
     OR employee_code = 'WEC137'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9807025016089', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9807025016089',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC645 / johanb@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('johanb@wearcheckrs.com')
     OR employee_code = 'WC645'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8108015025086', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8108015025086',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC491 / johanr@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('johanr@wearcheckrs.com')
     OR employee_code = 'WC491'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6502175101087', '1983-01-01')
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6502175101087', start_date = '1983-01-01',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC508 / johans@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('johans@wearcheckrs.com')
     OR employee_code = 'WC508'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6607255260081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6607255260081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC089 / johandre@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('johandre@wearcheckrs.com')
     OR employee_code = 'WEC089'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9108225061086', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9108225061086',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC531 / josephk@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('josephk@wearcheck.co.za')
     OR employee_code = 'WC531'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8503175119085', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8503175119085',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC527 / jeanj@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('jeanj@wearcheck.co.za')
     OR employee_code = 'WC527'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8112315087085', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8112315087085',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC135 / kevin@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('kevin@wearcheckrs.com')
     OR employee_code = 'WEC135'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6041153010860', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6041153010860',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC482 / khotso@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('khotso@wearcheckrs.com')
     OR employee_code = 'WC482'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7409035403084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7409035403084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC455 / leon@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('leon@wearcheckrs.com')
     OR employee_code = 'WC455'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8710045012081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8710045012081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC126 / lesego@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('lesego@wearcheckrs.com')
     OR employee_code = 'WEC126'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9911045198081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9911045198081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC495 / lorrainem@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('lorrainem@wearcheck.co.za')
     OR employee_code = 'WC495'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8501101025087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8501101025087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC648 / londolanim@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('londolanim@wearcheckrs.com')
     OR employee_code = 'WC648'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9103016120084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9103016120084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC269 / lopim@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('lopim@wearcheck.co.za')
     OR employee_code = 'WC269'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8805215317086', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8805215317086',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC277 / louis@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('louis@wearcheckrs.com')
     OR employee_code = 'WC277'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8801075058084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8801075058084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC118 / lubby@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('lubby@wearcheckrs.com')
     OR employee_code = 'WEC118'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8602105274083', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8602105274083',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC068 / lucas@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('lucas@wearcheckrs.com')
     OR employee_code = 'WEC068'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8808045136080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8808045136080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC116 / mande@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('mande@wearcheckrs.com')
     OR employee_code = 'WEC116'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9801050163080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9801050163080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC102 / marcel@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('marcel@wearcheckrs.com')
     OR employee_code = 'WEC102'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8002085057089', '2021-09-01')
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8002085057089', start_date = '2021-09-01',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC109 / mariette@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('mariette@wearcheckrs.com')
     OR employee_code = 'WEC109'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8007230056084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8007230056084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC106 / martiens@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('martiens@wearcheckrs.com')
     OR employee_code = 'WEC106'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9002175080081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9002175080081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC483 / mikes@weacheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('mikes@weacheckrs.com')
     OR employee_code = 'WC483'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6905175654080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6905175654080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC104 / megan@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('megan@wearcheckrs.com')
     OR employee_code = 'WEC104'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8209120022081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8209120022081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC536 / mervyng@wearcheck.co.za
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('mervyng@wearcheck.co.za')
     OR employee_code = 'WC536'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8403055141087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8403055141087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC088 / meshack@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('meshack@wearcheckrs.com')
     OR employee_code = 'WEC088'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8102065463081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8102065463081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC076 / micheal@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('micheal@wearcheckrs.com')
     OR employee_code = 'WEC076'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9003065041084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9003065041084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC291 / michealm@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('michealm@wearcheckrs.com')
     OR employee_code = 'WC291'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8311095612084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8311095612084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC465 / betty@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('betty@wearcheckrs.com')
     OR employee_code = 'WC465'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9009040882086', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9009040882086',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC361 / mornea@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('mornea@wearcheckrs.com')
     OR employee_code = 'WC361'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9007025116084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9007025116084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC113 / nadhira@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('nadhira@wearcheckrs.com')
     OR employee_code = 'WEC113'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9903260117086', '2022-03-01')
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9903260117086', start_date = '2022-03-01',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC506 / nico.duplessis@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('nico.duplessis@wearcheckrs.com')
     OR employee_code = 'WC506'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7909265166087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7909265166087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC099 / lloyd@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('lloyd@wearcheckrs.com')
     OR employee_code = 'WEC099'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8404025466083', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8404025466083',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC651 / nomvulam@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('nomvulam@wearcheckrs.com')
     OR employee_code = 'WC651'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8308230480088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8308230480088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC509 / landus@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('landus@wearcheckrs.com')
     OR employee_code = 'WC509'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8212115104088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8212115104088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC498 / patrick@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('patrick@wearcheckrs.com')
     OR employee_code = 'WC498'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8202155051083', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8202155051083',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC520 / peet@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('peet@wearcheckrs.com')
     OR employee_code = 'WC520'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9109040882086', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9109040882086',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC115 / percy@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('percy@wearcheckrs.com')
     OR employee_code = 'WEC115'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8202275069080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8202275069080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC253 / philip@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('philip@wearcheckrs.com')
     OR employee_code = 'WC253'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6302185092081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6302185092081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC382 / reinierk@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('reinierk@wearcheckrs.com')
     OR employee_code = 'WC382'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8911055085088', '2024-06-02')
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8911055085088', start_date = '2024-06-02',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC591 / riaandp@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('riaandp@wearcheckrs.com')
     OR employee_code = 'WC591'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7803025053083', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7803025053083',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC363 / riaandb@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('riaandb@wearcheckrs.com')
     OR employee_code = 'WC363'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9112255109088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9112255109088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC504 / rogerh@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('rogerh@wearcheckrs.com')
     OR employee_code = 'WC504'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7905115122080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7905115122080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC074 / rakcal@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('rakcal@wearcheckrs.com')
     OR employee_code = 'WEC074'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9908055644087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9908055644087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC381 / rohan@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('rohan@wearcheckrs.com')
     OR employee_code = 'WC381'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9206115090080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9206115090080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC096 / rynhardt@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('rynhardt@wearcheckrs.com')
     OR employee_code = 'WEC096'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8606195053083', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8606195053083',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC501 / rynhardt.smit@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('rynhardt.smit@wearcheckrs.com')
     OR employee_code = 'WC501'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '6701165103083', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '6701165103083',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC264 / sergent@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('sergent@wearcheckrs.com')
     OR employee_code = 'WC264'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7406165907082', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7406165907082',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC136 / shaun@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('shaun@wearcheckrs.com')
     OR employee_code = 'WEC136'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9106185149081', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9106185149081',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC130 / shivon@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('shivon@wearcheckrs.com')
     OR employee_code = 'WEC130'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9411020133088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9411020133088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC283 / simon@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('simon@wearcheckrs.com')
     OR employee_code = 'WC283'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7302060084087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7302060084087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC485 / simondifutso@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('simondifutso@wearcheckrs.com')
     OR employee_code = 'WC485'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7709175626083', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7709175626083',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC360 / siphoz@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('siphoz@wearcheckrs.com')
     OR employee_code = 'WC360'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8409175777080', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8409175777080',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC039 / siphom@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('siphom@wearcheckrs.com')
     OR employee_code = 'WEC039'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9003245800086', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9003245800086',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC487 / teresa.venter@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('teresa.venter@wearcheckrs.com')
     OR employee_code = 'WC487'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '7408120090087', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '7408120090087',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC140 / stephanie@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('stephanie@wearcheckrs.com')
     OR employee_code = 'WEC140'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8110190033083', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8110190033083',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC132 / thapelo@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('thapelo@wearcheckrs.com')
     OR employee_code = 'WEC132'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9404300596082', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9404300596082',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WC243 / thomas@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('thomas@wearcheckrs.com')
     OR employee_code = 'WC243'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8701225704084', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8701225704084',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC062 / thulani@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('thulani@wearcheckrs.com')
     OR employee_code = 'WEC062'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9701185872086', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9701185872086',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC057 / tonny@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('tonny@wearcheckrs.com')
     OR employee_code = 'WEC057'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '9111045626088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '9111045626088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC133 / tsietsi@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('tsietsi@wearcheckrs.com')
     OR employee_code = 'WEC133'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '8806066773088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '8806066773088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC124 / vernon@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('vernon@wearcheckrs.com')
     OR employee_code = 'WEC124'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, '0203195873088', NULL)
    ON CONFLICT (employee_id) DO UPDATE
      SET id_number = '0203195873088',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

  -- WEC127 / wihan@wearcheckrs.com
  SELECT id INTO v_id FROM profiles
  WHERE lower(email) = lower('wihan@wearcheckrs.com')
     OR employee_code = 'WEC127'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO employee_details (employee_id, id_number, start_date)
    VALUES (v_id, NULL, '2024-02-01')
    ON CONFLICT (employee_id) DO UPDATE
      SET start_date = '2024-02-01',
          updated_at = NOW()
      WHERE employee_details.id_number IS DISTINCT FROM EXCLUDED.id_number
         OR employee_details.start_date IS DISTINCT FROM EXCLUDED.start_date;
  END IF;

END $$;
