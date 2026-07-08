-- 066_profiles_sex.sql
-- Adds a 'sex' field to profiles for sex-aware leave display
-- (maternity leave shown only for female employees per BCEA s25).
-- Values: 'male' | 'female' | 'other' | NULL (prefer not to say)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sex TEXT
  CHECK (sex IN ('male', 'female', 'other'));
