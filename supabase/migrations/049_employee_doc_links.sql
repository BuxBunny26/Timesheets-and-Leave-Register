-- 049_employee_doc_links.sql
-- Adds storage for document filenames + clickable links (OneDrive URLs)
-- for ID, passport, driver's licence on employee_details, and for each
-- employee_certifications row.

ALTER TABLE employee_details
  ADD COLUMN IF NOT EXISTS id_file_name              TEXT,
  ADD COLUMN IF NOT EXISTS id_file_url               TEXT,
  ADD COLUMN IF NOT EXISTS passport_file_name        TEXT,
  ADD COLUMN IF NOT EXISTS passport_file_url         TEXT,
  ADD COLUMN IF NOT EXISTS drivers_licence_file_name TEXT,
  ADD COLUMN IF NOT EXISTS drivers_licence_file_url  TEXT;

ALTER TABLE employee_certifications
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_url  TEXT;
