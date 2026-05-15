-- Divisions
CREATE TABLE divisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

-- Departments
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  division_code TEXT REFERENCES divisions(code)
);

-- Payment Centres
CREATE TABLE payment_centres (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

-- Sites
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  city TEXT,
  province TEXT,
  country_code TEXT NOT NULL CHECK (country_code IN ('ZA','MZ','NA'))
);
