-- 043_enable_rls_on_policy_tables.sql
-- Supabase Security Advisor flagged these tables as "Policy Exists RLS
-- Disabled" / "RLS Disabled in Public". The policies from
-- 007_rls_policies.sql exist on them, but RLS itself is off on this
-- project (likely because 007 was applied before the tables were
-- recreated, or RLS was manually disabled at some point).
--
-- Re-enabling RLS activates the existing policies as designed — no
-- frontend changes required.

ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_weeks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_days         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ot_approvals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_verifications ENABLE ROW LEVEL SECURITY;
