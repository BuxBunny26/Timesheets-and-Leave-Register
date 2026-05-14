-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code TEXT UNIQUE,
  first_name TEXT NOT NULL,
  surname TEXT NOT NULL,
  email TEXT NOT NULL,
  cell_number TEXT,
  division_id UUID REFERENCES divisions(id),
  department_id UUID REFERENCES departments(id),
  payment_centre_id UUID REFERENCES payment_centres(id),
  site_id UUID REFERENCES sites(id),
  supervisor_id UUID REFERENCES profiles(id),
  role TEXT NOT NULL DEFAULT 'employee'
    CHECK (role IN ('employee','supervisor','manager','admin_manager','system_admin')),
  country_code TEXT NOT NULL DEFAULT 'ZA',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
