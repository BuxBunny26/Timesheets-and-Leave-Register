-- ============================================================
-- Fix 5 unresolved supervisor links (typos in source CSV)
-- Run this in Supabase SQL Editor after the employee import.
-- ============================================================

-- "Tsietsi Monnanyne" in CSV → actual email: tsietsi@wearcheckrs.com
-- Affects: Boitumelo Makgamatha, Martiens van Aarde, Simon Mosima
UPDATE profiles
SET supervisor_id = (SELECT id FROM profiles WHERE email = 'tsietsi@wearcheckrs.com')
WHERE email IN (
  'boitumelo@wearcheckrs.com',
  'martiens@wearcheckrs.com',
  'simon@wearcheckrs.com'
);

-- "Michael Preotrius" in CSV → actual email: micheal@wearcheckrs.com (WEC076)
-- Affects: CJ Woller, Thomas Mdhlala
UPDATE profiles
SET supervisor_id = (SELECT id FROM profiles WHERE email = 'micheal@wearcheckrs.com')
WHERE email IN (
  'cj@wearcheckrs.com',
  'thomas@wearcheckrs.com'
);

-- Verify all 5 are now linked
SELECT p.email, p.first_name, p.surname,
       s.email AS supervisor_email, s.first_name AS supervisor_name
FROM profiles p
LEFT JOIN profiles s ON s.id = p.supervisor_id
WHERE p.email IN (
  'boitumelo@wearcheckrs.com',
  'martiens@wearcheckrs.com',
  'simon@wearcheckrs.com',
  'cj@wearcheckrs.com',
  'thomas@wearcheckrs.com'
);
