ALTER TABLE timesheet_days ADD CONSTRAINT timesheet_days_week_date_unique UNIQUE (timesheet_week_id, date);
