-- 056_training_matrix.sql
-- Per-employee training planner: one entry per (employee × course × FY × quarter).
-- Financial year starts 1 Jul: Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun.

CREATE TABLE IF NOT EXISTS training_matrix_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id      UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  financial_year INTEGER NOT NULL,   -- e.g. 2026 means Jul 2025–Jun 2026
  quarter        INTEGER NOT NULL CHECK (quarter IN (1, 2, 3, 4)),
  status         TEXT NOT NULL DEFAULT 'planned'
                 CHECK (status IN ('planned', 'scheduled', 'completed', 'not_applicable')),
  completed_date DATE,
  notes          TEXT,
  updated_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, course_id, financial_year, quarter)
);

CREATE INDEX IF NOT EXISTS idx_matrix_fy_quarter ON training_matrix_entries(financial_year, quarter);
CREATE INDEX IF NOT EXISTS idx_matrix_employee   ON training_matrix_entries(employee_id);

ALTER TABLE training_matrix_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read training_matrix"
  ON training_matrix_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "supervisors write training_matrix"
  ON training_matrix_entries FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('supervisor','manager','admin_manager','system_admin')
  ));
