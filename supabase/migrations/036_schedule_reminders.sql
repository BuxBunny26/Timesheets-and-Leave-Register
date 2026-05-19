-- 036_schedule_reminders.sql
-- Schedules the weekly timesheet reminder (Mondays 07:00 SAST) and the
-- monthly verification reminder (every weekday 07:00 SAST — the function
-- internally decides whether to act based on the working-day-of-month).
--
-- PREREQUISITES (one-time, run in the Supabase SQL editor BEFORE this file):
--   select vault.create_secret(
--     'https://dmctmgrtjafnelrpnvin.supabase.co',
--     'project_url'
--   );
--   select vault.create_secret(
--     '<service-role-key>',
--     'service_role_key'
--   );
--
-- After that, this migration can be re-run safely.

CREATE OR REPLACE FUNCTION _vault_get(secret_name TEXT) RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = secret_name LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION _invoke_edge(fn_name TEXT) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  base_url TEXT := _vault_get('project_url');
  key      TEXT := _vault_get('service_role_key');
  req_id   bigint;
BEGIN
  SELECT net.http_post(
    url     := base_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || key,
                 'Content-Type', 'application/json'
               ),
    body    := '{}'::jsonb
  ) INTO req_id;
  RETURN req_id;
END;
$$;

-- Clean up any old jobs of the same name (idempotent)
SELECT cron.unschedule(jobid) FROM cron.job
 WHERE jobname IN ('weekly-timesheet-reminder', 'monthly-verification-reminder');

-- Mondays 07:00 UTC (= 09:00 SAST)
SELECT cron.schedule(
  'weekly-timesheet-reminder',
  '0 7 * * 1',
  $$ SELECT _invoke_edge('notify-weekly-timesheet'); $$
);

-- Weekdays 07:00 UTC. Function itself skips days that are not WD 1-4 or WD 7.
SELECT cron.schedule(
  'monthly-verification-reminder',
  '0 7 * * 1-5',
  $$ SELECT _invoke_edge('notify-verification-reminder'); $$
);
