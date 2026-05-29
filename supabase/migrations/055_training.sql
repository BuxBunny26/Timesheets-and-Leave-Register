-- 055_training.sql
-- Training management: courses catalog, scheduled sessions, and enrollments.
-- Courses are linked (optionally) to certification_types so that completing a
-- session can be used to satisfy a certification requirement.

-- ── 1. training_courses ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_courses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT,
  technology            TEXT,           -- mirrors certification_types.technology
  certification_type_id UUID REFERENCES certification_types(id) ON DELETE SET NULL,
  provider              TEXT,
  duration_days         INTEGER NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. training_sessions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES training_courses(id) ON DELETE RESTRICT,
  scheduled_date   DATE NOT NULL,
  end_date         DATE,
  location         TEXT,
  trainer_name     TEXT,
  max_participants INTEGER,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled','completed','cancelled')),
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. training_enrollments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_enrollments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'enrolled'
                   CHECK (status IN ('enrolled','completed','cancelled','no_show')),
  completion_date  DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, employee_id)
);

-- ── 4. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_training_sessions_date    ON training_sessions(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_training_sessions_status  ON training_sessions(status);
CREATE INDEX IF NOT EXISTS idx_training_enrollments_emp  ON training_enrollments(employee_id);
CREATE INDEX IF NOT EXISTS idx_training_enrollments_sess ON training_enrollments(session_id);

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE training_courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_enrollments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "auth read training_courses"     ON training_courses     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read training_sessions"    ON training_sessions    FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read training_enrollments" ON training_enrollments FOR SELECT TO authenticated USING (true);

-- Only supervisors/managers can write
CREATE POLICY "supervisors write training_courses" ON training_courses
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('supervisor','manager','admin_manager','system_admin')
  ));

CREATE POLICY "supervisors write training_sessions" ON training_sessions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('supervisor','manager','admin_manager','system_admin')
  ));

CREATE POLICY "supervisors write training_enrollments" ON training_enrollments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('supervisor','manager','admin_manager','system_admin')
  ));

-- ── 6. Seed courses matching existing certification_types ─────────────────────
INSERT INTO training_courses (name, technology, certification_type_id, provider, duration_days)
SELECT 'Balancing Training',
       'Balancing',
       id,
       'Wearcheck',
       2
FROM certification_types WHERE code = 'balancing'
ON CONFLICT DO NOTHING;

INSERT INTO training_courses (name, technology, certification_type_id, provider, duration_days)
SELECT 'Laser Alignment Training',
       'Alignment',
       id,
       'Wearcheck',
       2
FROM certification_types WHERE code = 'laser_alignment'
ON CONFLICT DO NOTHING;

INSERT INTO training_courses (name, technology, certification_type_id, provider, duration_days)
SELECT 'Mobius CAT I — Vibration Analysis',
       'Vibration',
       id,
       'Mobius Institute',
       5
FROM certification_types WHERE code = 'mobius_cat_1'
ON CONFLICT DO NOTHING;

INSERT INTO training_courses (name, technology, certification_type_id, provider, duration_days)
SELECT 'Mobius CAT II — Vibration Analysis',
       'Vibration',
       id,
       'Mobius Institute',
       5
FROM certification_types WHERE code = 'mobius_cat_2'
ON CONFLICT DO NOTHING;

INSERT INTO training_courses (name, technology, certification_type_id, provider, duration_days)
SELECT 'Mobius CAT III — Vibration Analysis',
       'Vibration',
       id,
       'Mobius Institute',
       5
FROM certification_types WHERE code = 'mobius_cat_3'
ON CONFLICT DO NOTHING;

INSERT INTO training_courses (name, technology, certification_type_id, provider, duration_days)
SELECT 'Mobius CAT IV — Vibration Analysis',
       'Vibration',
       id,
       'Mobius Institute',
       5
FROM certification_types WHERE code = 'mobius_cat_4'
ON CONFLICT DO NOTHING;

INSERT INTO training_courses (name, technology, certification_type_id, provider, duration_days)
SELECT 'Infrared Level I',
       'Infrared',
       id,
       'Infrared Training Center',
       3
FROM certification_types WHERE code = 'infrared_1'
ON CONFLICT DO NOTHING;

INSERT INTO training_courses (name, technology, certification_type_id, provider, duration_days)
SELECT 'Infrared Level II',
       'Infrared',
       id,
       'Infrared Training Center',
       3
FROM certification_types WHERE code = 'infrared_2'
ON CONFLICT DO NOTHING;

INSERT INTO training_courses (name, technology, certification_type_id, provider, duration_days)
SELECT 'Infrared Level III',
       'Infrared',
       id,
       'Infrared Training Center',
       3
FROM certification_types WHERE code = 'infrared_3'
ON CONFLICT DO NOTHING;
