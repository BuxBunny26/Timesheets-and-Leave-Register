-- vault-secrets.local.sql  (gitignored via *.local)
-- One-time setup. Run in the Supabase SQL editor BEFORE applying
-- migrations/036_schedule_reminders.sql.
--
-- vault.create_secret(secret_value, name) -- 2nd arg is the NAME we read back.
-- The names below ('project_url', 'service_role_key') must match the
-- _vault_get() calls inside 036.

select vault.create_secret(
  'https://dmctmgrtjafnelrpnvin.supabase.co',
  'project_url'
);

select vault.create_secret(
  '<paste real service role key here>',
  'service_role_key'
);

-- To rotate later:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'service_role_key'),
--     '<new key>'
--   );
