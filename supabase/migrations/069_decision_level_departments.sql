-- 069_decision_level_departments.sql
-- Adds decision_level field to profiles and seeds the
-- full department list from the new employee Excel format.

-- ── 1. Add decision_level column ─────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS decision_level TEXT;

-- ── 2. Upsert departments by name (cross-divisional, used in the org Excel) ──
INSERT INTO departments (code, name, division_code) VALUES
  ('ORG-RS',    'Reliability Services',           NULL),
  ('ORG-NDT',   'Non Destructive Testing (NDT)',   NULL),
  ('ORG-ADMIN', 'Administration',                  NULL),
  ('ORG-SALES', 'Sales',                           NULL),
  ('ORG-DIGIT', 'Digital',                         NULL),
  ('ORG-RC',    'Remote Centre',                   NULL),
  ('ORG-RCA',   'Rope Condition Assessment (RCA)', NULL),
  ('ORG-TC',    'Technical Compliance (TC)',        NULL)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
