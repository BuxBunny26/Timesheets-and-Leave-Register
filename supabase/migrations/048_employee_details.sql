-- 048_employee_details.sql
-- Adds the HR-style employee directory: personal/contact/medical/address
-- fields, dependants, and a normalized certifications table that powers
-- expiry alerts.

-- ============================================================
-- 1. employee_details (1:1 with profiles)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_details (
  employee_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  -- Identity documents
  id_attached BOOLEAN NOT NULL DEFAULT FALSE,
  has_passport BOOLEAN NOT NULL DEFAULT FALSE,
  passport_number TEXT,
  passport_expiry DATE,
  passport_attached BOOLEAN NOT NULL DEFAULT FALSE,

  -- Contact extras
  cell_phone_contract_owner TEXT,
  service_provider TEXT,
  whatsapp_number TEXT,
  personal_email TEXT,

  -- Driver's licence
  has_drivers_licence BOOLEAN NOT NULL DEFAULT FALSE,
  drivers_licence_number TEXT,
  drivers_licence_expiry DATE,
  drivers_licence_attached BOOLEAN NOT NULL DEFAULT FALSE,

  -- Medical
  has_medical_aid BOOLEAN NOT NULL DEFAULT FALSE,
  medical_aid_provider TEXT,
  medical_aid_number TEXT,
  medical_practitioner_name TEXT,
  doctor_contact_number TEXT,
  allergies_diet TEXT,

  -- Address
  home_address TEXT,
  complex_street_name TEXT,
  suburb TEXT,
  city TEXT,
  province TEXT,
  country TEXT,
  postal_code TEXT,
  home_pin_location TEXT,

  -- Next of kin
  next_of_kin_name TEXT,
  next_of_kin_relationship TEXT,
  next_of_kin_contact TEXT,

  -- Education
  matric BOOLEAN NOT NULL DEFAULT FALSE,
  matric_year INT,
  trade_certificate TEXT,
  diplomas_degrees TEXT,
  other_qualification TEXT,
  start_date DATE,

  -- Competencies (yes/no, no expiry)
  comp_alignment BOOLEAN NOT NULL DEFAULT FALSE,
  comp_balancing BOOLEAN NOT NULL DEFAULT FALSE,
  comp_vibration BOOLEAN NOT NULL DEFAULT FALSE,
  comp_sampling BOOLEAN NOT NULL DEFAULT FALSE,
  comp_thermography BOOLEAN NOT NULL DEFAULT FALSE,
  comp_motor_circuit_analysis BOOLEAN NOT NULL DEFAULT FALSE,
  comp_vibration_monitoring BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_employee_details_updated_at ON employee_details;
CREATE TRIGGER update_employee_details_updated_at
  BEFORE UPDATE ON employee_details
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_emp_details_passport_expiry
  ON employee_details(passport_expiry) WHERE passport_expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emp_details_licence_expiry
  ON employee_details(drivers_licence_expiry) WHERE drivers_licence_expiry IS NOT NULL;

-- ============================================================
-- 2. employee_dependants (children)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_dependants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date_of_birth DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emp_dependants_employee ON employee_dependants(employee_id);

-- ============================================================
-- 3. certification_types lookup
-- ============================================================
CREATE TABLE IF NOT EXISTS certification_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  display_order INT NOT NULL DEFAULT 100
);

INSERT INTO certification_types (code, name, category, display_order) VALUES
  ('balancing',       'Balancing',        'balancing',       10),
  ('laser_alignment', 'Laser Alignment',  'laser_alignment', 20),
  ('mobius_cat_1',    'Mobius CAT I',     'mobius',          30),
  ('mobius_cat_2',    'Mobius CAT II',    'mobius',          40),
  ('mobius_cat_3',    'Mobius CAT III',   'mobius',          50),
  ('mobius_cat_4',    'Mobius CAT IV',    'mobius',          60),
  ('infrared_1',      'Infra-Red I',      'infrared',        70),
  ('infrared_2',      'Infra-Red II',     'infrared',        80),
  ('infrared_3',      'Infra-Red III',    'infrared',        90)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 4. employee_certifications
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_certifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  certification_type_id UUID NOT NULL REFERENCES certification_types(id) ON DELETE RESTRICT,
  has_certification BOOLEAN NOT NULL DEFAULT FALSE,
  expiry_date DATE,
  attached BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, certification_type_id)
);

DROP TRIGGER IF EXISTS update_employee_certifications_updated_at ON employee_certifications;
CREATE TRIGGER update_employee_certifications_updated_at
  BEFORE UPDATE ON employee_certifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_emp_cert_employee  ON employee_certifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_cert_expiry    ON employee_certifications(expiry_date)
  WHERE expiry_date IS NOT NULL AND has_certification = TRUE;

-- ============================================================
-- 5. RLS
-- ============================================================
ALTER TABLE employee_details        ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_dependants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE certification_types     ENABLE ROW LEVEL SECURITY;

-- Read certification_types: any authenticated user
DROP POLICY IF EXISTS cert_types_select_all ON certification_types;
CREATE POLICY cert_types_select_all ON certification_types
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS cert_types_admin_all ON certification_types;
CREATE POLICY cert_types_admin_all ON certification_types
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- employee_details policies
DROP POLICY IF EXISTS ed_select_own       ON employee_details;
DROP POLICY IF EXISTS ed_select_team      ON employee_details;
DROP POLICY IF EXISTS ed_select_admin     ON employee_details;
DROP POLICY IF EXISTS ed_update_own       ON employee_details;
DROP POLICY IF EXISTS ed_update_admin     ON employee_details;
DROP POLICY IF EXISTS ed_insert_own       ON employee_details;
DROP POLICY IF EXISTS ed_insert_admin     ON employee_details;
DROP POLICY IF EXISTS ed_delete_admin     ON employee_details;

CREATE POLICY ed_select_own ON employee_details
  FOR SELECT USING (employee_id = auth.uid());
CREATE POLICY ed_select_team ON employee_details
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );
CREATE POLICY ed_select_admin ON employee_details
  FOR SELECT USING (is_admin());

CREATE POLICY ed_insert_own ON employee_details
  FOR INSERT WITH CHECK (employee_id = auth.uid());
CREATE POLICY ed_insert_admin ON employee_details
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY ed_update_own ON employee_details
  FOR UPDATE USING (employee_id = auth.uid());
CREATE POLICY ed_update_admin ON employee_details
  FOR UPDATE USING (is_admin());

CREATE POLICY ed_delete_admin ON employee_details
  FOR DELETE USING (is_admin());

-- employee_dependants policies (mirror employee_details)
DROP POLICY IF EXISTS dep_select_own   ON employee_dependants;
DROP POLICY IF EXISTS dep_select_team  ON employee_dependants;
DROP POLICY IF EXISTS dep_select_admin ON employee_dependants;
DROP POLICY IF EXISTS dep_modify_own   ON employee_dependants;
DROP POLICY IF EXISTS dep_modify_admin ON employee_dependants;

CREATE POLICY dep_select_own ON employee_dependants
  FOR SELECT USING (employee_id = auth.uid());
CREATE POLICY dep_select_team ON employee_dependants
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );
CREATE POLICY dep_select_admin ON employee_dependants
  FOR SELECT USING (is_admin());

CREATE POLICY dep_modify_own ON employee_dependants
  FOR ALL USING (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid());
CREATE POLICY dep_modify_admin ON employee_dependants
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- employee_certifications policies
DROP POLICY IF EXISTS cert_select_own   ON employee_certifications;
DROP POLICY IF EXISTS cert_select_team  ON employee_certifications;
DROP POLICY IF EXISTS cert_select_admin ON employee_certifications;
DROP POLICY IF EXISTS cert_modify_own   ON employee_certifications;
DROP POLICY IF EXISTS cert_modify_admin ON employee_certifications;

CREATE POLICY cert_select_own ON employee_certifications
  FOR SELECT USING (employee_id = auth.uid());
CREATE POLICY cert_select_team ON employee_certifications
  FOR SELECT USING (
    get_my_role() IN ('supervisor','manager','admin_manager','system_admin')
    AND is_in_team(employee_id)
  );
CREATE POLICY cert_select_admin ON employee_certifications
  FOR SELECT USING (is_admin());

CREATE POLICY cert_modify_own ON employee_certifications
  FOR ALL USING (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid());
CREATE POLICY cert_modify_admin ON employee_certifications
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- 6. Auto-create employee_details row when a profile is created
-- ============================================================
CREATE OR REPLACE FUNCTION ensure_employee_details_row()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO employee_details (employee_id)
  VALUES (NEW.id)
  ON CONFLICT (employee_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ensure_employee_details ON profiles;
CREATE TRIGGER trg_ensure_employee_details
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION ensure_employee_details_row();

-- Backfill existing profiles
INSERT INTO employee_details (employee_id)
SELECT id FROM profiles
ON CONFLICT (employee_id) DO NOTHING;
