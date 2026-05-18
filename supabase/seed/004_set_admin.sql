-- ============================================================
-- 004_set_admin.sql
-- Run in Supabase SQL Editor to make nadhira a system_admin
-- AFTER she has signed in or been created via the import script.
-- ============================================================

UPDATE profiles
SET role = 'system_admin'
WHERE email ILIKE 'nadhira@wearcheckrs.com';

-- Verify:
SELECT id, employee_code, first_name, surname, email, role
FROM profiles
WHERE email ILIKE 'nadhira@wearcheckrs.com';
