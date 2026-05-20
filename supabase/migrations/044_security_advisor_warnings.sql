-- 044_security_advisor_warnings.sql
-- Address Supabase Security Advisor WARN-level lints:
--
--   1. function_search_path_mutable   -> pin search_path on each function
--   2. anon/authenticated_security_definer_function_executable
--                                      -> revoke EXECUTE from anon (and
--                                         from authenticated for trigger-
--                                         only helpers) so PostgREST can
--                                         no longer expose them as RPC
--   3. rls_policy_always_true (audit_log INSERT)
--                                      -> drop the WITH CHECK (true)
--                                         insert policy; rows are written
--                                         by SECURITY DEFINER triggers
--                                         which bypass RLS
--   4. public_bucket_allows_listing (avatars)
--                                      -> drop the broad SELECT policy on
--                                         storage.objects; the bucket
--                                         stays public for direct URL
--                                         access (no listing)
--
-- NOT addressed here (require dashboard action or are knowingly kept):
--   - extension_in_public (pg_net)              -> moving extensions on
--     managed Postgres is risky; low severity, leaving as-is.
--   - auth_leaked_password_protection           -> Auth dashboard toggle,
--     not a SQL setting.
--   - approved_leave_calendar SECURITY DEFINER  -> intentional; required
--     for the company-wide leave calendar widget.

-- ---------------------------------------------------------------------
-- 1. Pin search_path on every function flagged by the advisor.
-- ---------------------------------------------------------------------
ALTER FUNCTION public.update_updated_at_column()         SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_role()                      SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin()                         SET search_path = public, pg_temp;
ALTER FUNCTION public.is_direct_report(uuid)             SET search_path = public, pg_temp;
ALTER FUNCTION public.is_in_team(uuid)                   SET search_path = public, pg_temp;
ALTER FUNCTION public.resolve_approver(uuid, uuid)       SET search_path = public, pg_temp;
ALTER FUNCTION public._vault_get(text)                   SET search_path = public, pg_temp;
ALTER FUNCTION public._invoke_edge(text)                 SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 2a. RLS-helper functions: keep EXECUTE for authenticated (RLS policy
--     expressions need to call them as the caller's role), revoke from
--     anon and PUBLIC so they can't be invoked as RPC by anonymous
--     clients.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_my_role()                FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin()                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_direct_report(uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_in_team(uuid)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_approver(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_supervisor_id()       FROM PUBLIC, anon;

-- ---------------------------------------------------------------------
-- 2b. Trigger/cron-only functions: revoke EXECUTE from PUBLIC, anon and
--     authenticated. They still run from triggers/cron because they are
--     SECURITY DEFINER (executes as owner = postgres).
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_leave_balance_change()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_leave_status()                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_ot_approval()                             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_timesheet_status()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_monthly_ot_threshold()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_notifications()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, uuid)
                                                                                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_verification_weeks_submitted()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_awol_recorded()                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_leave_actioned()                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_leave_submitted()                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_ot_submitted()                           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_timesheet_reviewed()                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_timesheet_submitted()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_timesheet_supervisor_on_submit()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_verification_on_week_submit()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_leave_balance()                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_ot_approval_for_day()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._vault_get(text)                                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._invoke_edge(text)                              FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Drop the always-true INSERT policy on audit_log. Rows continue to
--    be inserted via SECURITY DEFINER trigger functions (which bypass
--    RLS), and the frontend never inserts into audit_log directly.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_insert_any" ON audit_log;

-- ---------------------------------------------------------------------
-- 4. Drop the broad SELECT policy on storage.objects for the avatars
--    bucket. Public buckets don't need a SELECT policy to serve files
--    by URL; the existing policy was allowing anyone to list every
--    avatar in the bucket.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
