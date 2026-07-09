-- 070_underground_lol_loi_fields.sql
-- Adds underground shift tracking and province/country selectors
-- for LOL (Living Out Loan) and LOI (Living Out International).

ALTER TABLE timesheet_days
  ADD COLUMN IF NOT EXISTS underground_flag  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS underground_hours DECIMAL(4,2),
  ADD COLUMN IF NOT EXISTS lol_province      TEXT,
  ADD COLUMN IF NOT EXISTS loi_country       TEXT;
