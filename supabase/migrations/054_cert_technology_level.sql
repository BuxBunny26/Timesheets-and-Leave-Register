-- 054_cert_technology_level.sql
-- Adds technology (Balancing / Alignment / Vibration / Infrared) and
-- cert_level (CAT I … CAT IV, Level I … Level III) to certification_types.
-- Also extends the attachments.linked_to_type CHECK to include 'certification'
-- so certificate files can be stored against an employee_certifications row.

-- ── 1. New columns on certification_types ────────────────────────────────────
ALTER TABLE certification_types
  ADD COLUMN IF NOT EXISTS technology TEXT,
  ADD COLUMN IF NOT EXISTS cert_level  TEXT;

-- ── 2. Populate from existing seed rows ──────────────────────────────────────
UPDATE certification_types SET technology = 'Balancing'  WHERE code = 'balancing';
UPDATE certification_types SET technology = 'Alignment'  WHERE code = 'laser_alignment';
UPDATE certification_types SET technology = 'Vibration',  cert_level = 'CAT I'   WHERE code = 'mobius_cat_1';
UPDATE certification_types SET technology = 'Vibration',  cert_level = 'CAT II'  WHERE code = 'mobius_cat_2';
UPDATE certification_types SET technology = 'Vibration',  cert_level = 'CAT III' WHERE code = 'mobius_cat_3';
UPDATE certification_types SET technology = 'Vibration',  cert_level = 'CAT IV'  WHERE code = 'mobius_cat_4';
UPDATE certification_types SET technology = 'Infrared',   cert_level = 'Level I'   WHERE code = 'infrared_1';
UPDATE certification_types SET technology = 'Infrared',   cert_level = 'Level II'  WHERE code = 'infrared_2';
UPDATE certification_types SET technology = 'Infrared',   cert_level = 'Level III' WHERE code = 'infrared_3';

-- ── 3. Extend attachments to support certification file uploads ───────────────
-- Drop the existing check constraint and recreate it with 'certification' added.
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_linked_to_type_check;
ALTER TABLE attachments
  ADD CONSTRAINT attachments_linked_to_type_check
    CHECK (linked_to_type IN ('timesheet', 'leave_request', 'overtime', 'certification'));
