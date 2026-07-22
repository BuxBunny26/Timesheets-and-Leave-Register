-- 072_leave_types.sql
-- Creates the leave_types lookup table — the "WHAT" layer of the leave system.
--
-- ARCHITECTURE
-- Leave types describe what a leave category IS (Annual, Study, Maternity…).
-- They do NOT contain entitlement days, approval rules, or carry-over rules.
-- Those belong in leave_policy_rules (added in migration 073), which binds a
-- leave policy (e.g. "Permanent Staff") to a leave type with all behavioural
-- rules. Employees are then assigned a leave policy. This separates:
--
--   leave_types         ← WHAT the leave is (category / label)
--   leave_policies      ← named rule sets (Permanent, Temporary, Contractor…)
--   leave_policy_rules  ← HOW each type behaves within each policy
--   employee policies   ← WHICH policy applies to each employee
--
-- This design supports different entitlements for different employee groups,
-- legal entities, and future policy changes without schema changes.
--
-- PARTIAL DAY SUPPORT
-- allows_partial_day is FALSE for all types in the current version.
-- Future support will require leave_request_days / timesheet_day_segments.
--
-- IDEMPOTENCY
-- Safe to re-run. IF NOT EXISTS + ON CONFLICT DO NOTHING.

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_types (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code                      TEXT        NOT NULL UNIQUE,
  name                      TEXT        NOT NULL,
  description               TEXT,
  is_active                 BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Controls whether this type appears in the Leave Request form dropdown.
  -- Sick Leave is FALSE: it is captured via the timesheet primary status
  -- sick + its own sick-note workflow, but it still requires a formal leave
  -- request and follows both approval stages per company policy.
  appears_in_leave_dropdown BOOLEAN     NOT NULL DEFAULT TRUE,

  display_order             INTEGER     NOT NULL DEFAULT 0,

  -- Partial-day leave is not supported in the current version.
  -- TODO: future — leave_request_days / timesheet_day_segments.
  allows_partial_day        BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at.
DROP TRIGGER IF EXISTS update_leave_types_updated_at ON leave_types;
CREATE TRIGGER update_leave_types_updated_at
  BEFORE UPDATE ON leave_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Seed: 9 canonical leave categories ───────────────────────────────────────
-- Entitlement days, approval rules, document requirements and carry-over rules
-- are NOT seeded here — they belong in leave_policy_rules (migration 073).
--
-- Legacy code 'family' maps to 'family_responsibility' — backfill in mig 074.
-- Parental leave eligibility is determined by supporting documentation and the
-- approval workflow, not by profile.sex or hardcoded statutory durations.

INSERT INTO leave_types (code, name, appears_in_leave_dropdown, display_order)
VALUES
  ('annual',                 'Annual Leave',                TRUE,  10),
  ('sick',                   'Sick Leave',                  FALSE, 20),
  ('family_responsibility',  'Family Responsibility Leave', TRUE,  30),
  ('study',                  'Study Leave',                 TRUE,  40),
  ('maternity',              'Maternity Leave',             TRUE,  50),
  ('adoption',               'Adoption Leave',              TRUE,  60),
  ('parental',               'Parental Leave',              TRUE,  70),
  ('unpaid',                 'Unpaid Leave',                TRUE,  80),
  ('other',                  'Other Leave',                 TRUE,  90)
ON CONFLICT (code) DO NOTHING;

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT code, name, appears_in_leave_dropdown, display_order
--   FROM leave_types ORDER BY display_order;
-- Expected: 9 rows. sick has appears_in_leave_dropdown = false.

--
-- DESIGN INTENT
-- All leave-type definitions live here. No SQL CHECK constraints, TypeScript
-- unions, or React arrays should maintain their own copy of leave-type codes.
-- Both leave_requests and timesheet_days will reference leave_types via FK
-- (added in subsequent migrations after existing data is inspected).
--
-- IDEMPOTENCY
-- Safe to re-run. Uses IF NOT EXISTS for the table and ON CONFLICT DO NOTHING
-- for each seed row. The updated_at trigger uses the existing
-- update_updated_at_column() function from migration 004.

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_types (
  id                                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code                                TEXT        NOT NULL UNIQUE,
  name                                TEXT        NOT NULL,
  description                         TEXT,
  is_active                           BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Whether this type appears in the Leave Request form dropdown.
  -- Sick Leave is excluded because it is handled via the timesheet primary
  -- status and its own sick-note validation workflow, but it still participates
  -- in the formal leave-request and approval process.
  appears_in_leave_dropdown           BOOLEAN     NOT NULL DEFAULT TRUE,

  display_order                       INTEGER     NOT NULL DEFAULT 0,

  -- Annual entitlement in days. NULL = no fixed entitlement defined here
  -- (balance is governed externally or via contract). Example: study = 10.
  annual_entitlement_days             NUMERIC(6,2),

  -- How the entitlement period resets.
  -- Known values: 'financial_year', 'policy_cycle', NULL (no reset / once-off).
  entitlement_period                  TEXT,

  -- Formal leave request required before or alongside this leave.
  requires_request                    BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Supporting documents required.
  requires_attachment                 BOOLEAN     NOT NULL DEFAULT FALSE,
  attachment_requirement_description  TEXT,

  -- Whether approved days are subtracted from a leave balance.
  deducts_balance                     BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Whether the system tracks an entitlement ceiling for this type.
  tracks_entitlement                  BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Whether Stage 2 (Executive) approval is required.
  -- Set TRUE for all types per confirmed organisational workflow.
  -- Override per type as policy evolves without code changes.
  requires_secondary_approval         BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Partial-day leave is not supported in the current version.
  -- TODO: future support via leave_request_days / timesheet_day_segments.
  allows_partial_day                  BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on any modification.
DROP TRIGGER IF EXISTS update_leave_types_updated_at ON leave_types;
CREATE TRIGGER update_leave_types_updated_at
  BEFORE UPDATE ON leave_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Add columns introduced in the second table definition (idempotent) ────────
-- These are missing when the table was already created from the first
-- CREATE TABLE IF NOT EXISTS block above (which had fewer columns).
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS annual_entitlement_days            NUMERIC(6,2);
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS entitlement_period                 TEXT;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS requires_request                   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS requires_attachment                BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS attachment_requirement_description TEXT;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS deducts_balance                    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS tracks_entitlement                 BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS requires_secondary_approval        BOOLEAN NOT NULL DEFAULT TRUE;

-- ── Seed data ─────────────────────────────────────────────────────────────────
-- annual_entitlement_days is NULL for annual/sick/family_responsibility because
-- the current balance trigger (sync_leave_balance) still seeds those defaults
-- (15 / 30 / 3 days respectively). They will be migrated to this table in a
-- later step once leave_balances is confirmed.
-- study = 10 days per financial year per company policy — replaces the
-- hardcoded STATUTORY_DEFAULTS.study = 0 in LeavePage.tsx.

INSERT INTO leave_types (
  code,
  name,
  appears_in_leave_dropdown,
  display_order,
  annual_entitlement_days,
  entitlement_period,
  requires_request,
  requires_attachment,
  attachment_requirement_description,
  deducts_balance,
  tracks_entitlement,
  requires_secondary_approval
) VALUES

  -- Balance-bearing leave types
  ('annual',
   'Annual Leave',
   TRUE,  10,
   NULL,  'financial_year',
   TRUE,  FALSE, NULL,
   TRUE,  TRUE,  TRUE),

  -- Sick Leave: excluded from the leave dropdown because the timesheet
  -- primary_status = 'sick' handles it separately, but the leave request
  -- still exists and goes through both approval stages per company policy.
  ('sick',
   'Sick Leave',
   FALSE, 20,
   NULL,  'policy_cycle',
   TRUE,  FALSE, NULL,
   TRUE,  TRUE,  TRUE),

  -- Legacy code 'family' maps to this code 'family_responsibility'.
  -- Backfill handled in migration 073.
  ('family_responsibility',
   'Family Responsibility Leave',
   TRUE,  30,
   NULL,  'financial_year',
   TRUE,  FALSE, NULL,
   TRUE,  TRUE,  TRUE),

  -- 10 working days per financial year (1 Jul – 30 Jun).
  -- Requires proof: exam timetable, admission letter, or equivalent.
  -- Final Executive approval is blocked until proof is attached to the request.
  ('study',
   'Study Leave',
   TRUE,  40,
   10,    'financial_year',
   TRUE,  TRUE,
   'Exam timetable, admission letter, or equivalent institutional proof required. '
   'Attach to the leave request before Executive approval can be granted.',
   TRUE,  TRUE,  TRUE),

  -- Non-balance leave types (require request + approval + documentation)
  -- Parental eligibility is not determined by profile.sex — see migration notes.
  -- Policy durations are not hardcoded here; they are configurable attachments
  -- and approvals in the leave request workflow.
  ('maternity',
   'Maternity Leave',
   TRUE,  50,
   NULL,  NULL,
   TRUE,  TRUE,
   'Supporting documentation required (e.g. clinic letter, birth certificate).',
   FALSE, FALSE, TRUE),

  ('adoption',
   'Adoption Leave',
   TRUE,  60,
   NULL,  NULL,
   TRUE,  TRUE,
   'Court order, placement certificate or equivalent adoption documentation required.',
   FALSE, FALSE, TRUE),

  ('parental',
   'Parental Leave',
   TRUE,  70,
   NULL,  NULL,
   TRUE,  TRUE,
   'Supporting documentation required. Applicable to the non-birth parent, '
   'co-adoptive parent or commissioning parent. Policy duration is configurable.',
   FALSE, FALSE, TRUE),

  ('unpaid',
   'Unpaid Leave',
   TRUE,  80,
   NULL,  NULL,
   TRUE,  FALSE, NULL,
   FALSE, FALSE, TRUE),

  ('other',
   'Other Leave',
   TRUE,  90,
   NULL,  NULL,
   TRUE,  FALSE,
   'A reason or motivation must be provided. Other Leave requires both '
   'Supervisor and Executive approval and is reported separately.',
   FALSE, FALSE, TRUE)

ON CONFLICT (code) DO NOTHING;

-- ── Verification ─────────────────────────────────────────────────────────────
-- Run the following in the Supabase SQL editor to confirm seed data is correct:
--
--   SELECT code, name, appears_in_leave_dropdown, display_order,
--          annual_entitlement_days, deducts_balance, tracks_entitlement,
--          requires_secondary_approval
--     FROM leave_types
--    ORDER BY display_order;
--
-- Expected: 9 rows in order annual → sick → family_responsibility → study →
--           maternity → adoption → parental → unpaid → other.

