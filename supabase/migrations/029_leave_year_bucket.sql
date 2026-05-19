-- Add the financial-year "bucket" a leave request is charged against.
-- Convention: leave_year = the calendar year in which the FY ENDS.
--   * 2025 bucket = FY 1 Jul 2024 – 30 Jun 2025
--   * 2026 bucket = FY 1 Jul 2025 – 30 Jun 2026
-- Employees may book leave that falls inside one FY but charge it against
-- the previous FY's leftover balance.

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS leave_year INTEGER;

-- Backfill: default each existing row to the FY-end year of its start_date.
UPDATE leave_requests
SET leave_year = CASE
  WHEN EXTRACT(MONTH FROM start_date) >= 7
    THEN EXTRACT(YEAR FROM start_date)::INT + 1
  ELSE EXTRACT(YEAR FROM start_date)::INT
END
WHERE leave_year IS NULL;
