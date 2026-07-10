-- 071_schedule_leave_balance_alert.sql
-- Schedules a monthly leave-balance alert for supervisors and managers.
-- On the 1st of each month, the notify-leave-balance-alert Edge Function
-- is invoked and notifies every supervisor/manager whose team has one or
-- more employees with ≥ 20 days of unused annual leave remaining in the
-- current financial year.
--
-- PREREQUISITES: migration 036 must already be applied (_invoke_edge helper).

-- Remove any previous job of the same name (idempotent re-runs)
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'monthly-leave-balance-alert';

-- 1st of each month at 07:00 UTC (= 09:00 SAST)
SELECT cron.schedule(
  'monthly-leave-balance-alert',
  '0 7 1 * *',
  $$ SELECT _invoke_edge('notify-leave-balance-alert'); $$
);
