-- Track number of times a timesheet week has been resubmitted after an
-- initial submission. Used to display a "Resubmitted" tag without changing
-- the underlying status enum.
ALTER TABLE timesheet_weeks
  ADD COLUMN IF NOT EXISTS resubmission_count INTEGER NOT NULL DEFAULT 0;
