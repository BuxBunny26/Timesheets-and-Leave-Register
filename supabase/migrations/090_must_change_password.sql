-- 090_must_change_password.sql
-- Adds a forced "create your own password" step for first-time sign-in.
--
-- CONTEXT: 112 of 115 employee accounts have never logged in (only the 3
-- internal test accounts — Shivon, Megan, Bianka — have). All 115 accounts
-- currently share the same default password set at import time
-- ('WearCheck@2024!'). Before rollout, every employee must be forced to set
-- their own password on first successful sign-in.
--
-- FLOW: employee signs in with the shared default password → app detects
-- must_change_password = TRUE → shows a "Create your password" screen →
-- on success, must_change_password is set to FALSE and the user proceeds
-- into the app as normal.
--
-- DEFAULT TRUE so any future employee accounts created by import scripts
-- automatically require this flow too.
--
-- IDEMPOTENCY: ADD COLUMN IF NOT EXISTS is safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;

-- The 3 internal test/dev accounts already sign in with their own
-- self-chosen passwords (real activity recorded on all 3) — exempt them.
UPDATE profiles
SET must_change_password = FALSE
WHERE email IN ('shivon@wearcheckrs.com', 'megan@wearcheckrs.com', 'bianka@wearcheckrs.com');
