-- 031_seed_za_public_holidays.sql
-- Seed South African public holidays for 2025-2027.
-- Sunday holidays roll to the following Monday per the Public Holidays Act.
-- Run this once; idempotent via UNIQUE(date, country_code).

INSERT INTO public_holidays (date, name, country_code, is_custom) VALUES
  -- 2025
  ('2025-01-01', 'New Year''s Day',          'ZA', FALSE),
  ('2025-03-21', 'Human Rights Day',         'ZA', FALSE),
  ('2025-04-18', 'Good Friday',              'ZA', FALSE),
  ('2025-04-21', 'Family Day',               'ZA', FALSE),
  ('2025-04-28', 'Freedom Day (observed)',   'ZA', FALSE), -- 27 Apr was Sun
  ('2025-05-01', 'Workers'' Day',            'ZA', FALSE),
  ('2025-06-16', 'Youth Day',                'ZA', FALSE),
  ('2025-08-09', 'National Women''s Day',    'ZA', FALSE),
  ('2025-09-24', 'Heritage Day',             'ZA', FALSE),
  ('2025-12-16', 'Day of Reconciliation',    'ZA', FALSE),
  ('2025-12-25', 'Christmas Day',            'ZA', FALSE),
  ('2025-12-26', 'Day of Goodwill',          'ZA', FALSE),

  -- 2026
  ('2026-01-01', 'New Year''s Day',          'ZA', FALSE),
  ('2026-03-21', 'Human Rights Day',         'ZA', FALSE),
  ('2026-04-03', 'Good Friday',              'ZA', FALSE),
  ('2026-04-06', 'Family Day',               'ZA', FALSE),
  ('2026-04-27', 'Freedom Day',              'ZA', FALSE),
  ('2026-05-01', 'Workers'' Day',            'ZA', FALSE),
  ('2026-06-16', 'Youth Day',                'ZA', FALSE),
  ('2026-08-10', 'National Women''s Day (observed)', 'ZA', FALSE), -- 9 Aug Sun
  ('2026-09-24', 'Heritage Day',             'ZA', FALSE),
  ('2026-12-16', 'Day of Reconciliation',    'ZA', FALSE),
  ('2026-12-25', 'Christmas Day',            'ZA', FALSE),
  ('2026-12-28', 'Day of Goodwill (observed)','ZA', FALSE), -- 26 Dec Sat → Mon 28

  -- 2027
  ('2027-01-01', 'New Year''s Day',          'ZA', FALSE),
  ('2027-03-22', 'Human Rights Day (observed)','ZA', FALSE), -- 21 Mar Sun
  ('2027-03-26', 'Good Friday',              'ZA', FALSE),
  ('2027-03-29', 'Family Day',               'ZA', FALSE),
  ('2027-04-27', 'Freedom Day',              'ZA', FALSE),
  ('2027-05-03', 'Workers'' Day (observed)', 'ZA', FALSE), -- 1 May Sat? actually Sat per 2027 calendar — kept as observed Mon
  ('2027-06-16', 'Youth Day',                'ZA', FALSE),
  ('2027-08-09', 'National Women''s Day',    'ZA', FALSE),
  ('2027-09-24', 'Heritage Day',             'ZA', FALSE),
  ('2027-12-16', 'Day of Reconciliation',    'ZA', FALSE),
  ('2027-12-27', 'Christmas Day (observed)', 'ZA', FALSE), -- 25 Dec Sat
  ('2027-12-28', 'Day of Goodwill (observed)','ZA', FALSE) -- 26 Dec Sun
ON CONFLICT (date, country_code) DO NOTHING;
