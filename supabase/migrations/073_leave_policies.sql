-- 073_leave_policies.sql
-- Creates leave_policies and leave_policy_rules tables — the "HOW" layer.
--
-- ARCHITECTURE
--   leave_types       ← WHAT the leave is (migration 072)
--   leave_policies    ← named rule sets assigned to employees  ← THIS FILE
--   leave_policy_rules ← how each leave type behaves per policy ← THIS FILE
--
-- A single "Standard" policy is seeded covering all 9 leave types.
-- Additional policies (Temporary, Contractor, etc.) can be added later
-- without schema changes.
--
-- PREREQUISITES: migration 072 (leave_types) must be applied first.
-- IDEMPOTENCY: IF NOT EXISTS + ON CONFLICT DO NOTHING.

-- ── leave_policies ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_policies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_leave_policies_updated_at ON leave_policies;
CREATE TRIGGER update_leave_policies_updated_at
  BEFORE UPDATE ON leave_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── leave_policy_rules ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_policy_rules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  leave_policy_id  UUID        NOT NULL REFERENCES leave_policies(id),
  leave_type_id    UUID        NOT NULL REFERENCES leave_types(id),

  -- Entitlement
  -- NULL = no fixed entitlement (maternity, adoption, parental, unpaid, other)
  entitlement_days    NUMERIC(6,2),

  -- How the entitlement cycle is determined.
  -- 'financial_year'  = 1 Jul – 30 Jun (study, family_responsibility)
  -- 'engagement_date' = anniversary of employee start date (annual, sick)
  -- NULL              = no cycle (maternity, adoption, parental, etc.)
  cycle_basis         TEXT
    CHECK (cycle_basis IS NULL OR cycle_basis IN
           ('financial_year', 'engagement_date', 'rolling_months')),

  -- Length of the entitlement cycle in months.
  -- 12 = annual, 36 = sick 36-month cycle, NULL = no fixed cycle
  cycle_months        INTEGER,

  -- Carry-over rules
  carryover_allowed   BOOLEAN     NOT NULL DEFAULT FALSE,
  carryover_limit_days NUMERIC(6,2),  -- NULL = unlimited if carryover_allowed

  -- Balance behaviour
  deducts_balance     BOOLEAN     NOT NULL DEFAULT FALSE,
  tracks_entitlement  BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Approval requirements
  requires_executive_approval BOOLEAN NOT NULL DEFAULT TRUE,

  -- Documentation requirements
  requires_attachment       BOOLEAN NOT NULL DEFAULT FALSE,
  attachment_description    TEXT,

  -- Whether the employee must provide a reason on the leave request
  requires_reason           BOOLEAN NOT NULL DEFAULT FALSE,

  -- Optional date range for when this rule is active.
  -- NULL effective_to = currently active.
  effective_from  DATE,
  effective_to    DATE,

  UNIQUE(leave_policy_id, leave_type_id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_leave_policy_rules_updated_at ON leave_policy_rules;
CREATE TRIGGER update_leave_policy_rules_updated_at
  BEFORE UPDATE ON leave_policy_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Seed: Standard policy ─────────────────────────────────────────────────────
INSERT INTO leave_policies (code, name, description)
VALUES (
  'standard',
  'Standard',
  'Default leave policy applied to all employees pending individual policy review.'
)
ON CONFLICT (code) DO NOTHING;

-- ── Seed: Standard policy rules ───────────────────────────────────────────────
-- Uses a CTE to keep the INSERT readable and avoid hard-coding UUIDs.
-- ON CONFLICT DO NOTHING ensures idempotency on re-runs.

INSERT INTO leave_policy_rules (
  leave_policy_id,
  leave_type_id,
  entitlement_days,
  cycle_basis,
  cycle_months,
  carryover_allowed,
  deducts_balance,
  tracks_entitlement,
  requires_executive_approval,
  requires_attachment,
  attachment_description,
  requires_reason
)
SELECT
  p.id          AS leave_policy_id,
  lt.id         AS leave_type_id,
  r.entitlement_days,
  r.cycle_basis,
  r.cycle_months,
  r.carryover_allowed,
  r.deducts_balance,
  r.tracks_entitlement,
  r.requires_executive_approval,
  r.requires_attachment,
  r.attachment_description,
  r.requires_reason
FROM leave_policies p
CROSS JOIN (
  VALUES
    -- code,  entitlement, cycle_basis,         months, carryover, deducts, tracks, exec,  attach, attach_desc,                                                        reason
    ('annual',              15,    'engagement_date',    12,  FALSE, TRUE,  TRUE,  TRUE,  FALSE, NULL,                                                                  FALSE),
    ('sick',                30,    'engagement_date',    36,  FALSE, TRUE,  TRUE,  TRUE,  FALSE, NULL,                                                                  FALSE),
    ('family_responsibility', 3,   'financial_year',     12,  FALSE, TRUE,  TRUE,  TRUE,  FALSE, NULL,                                                                  FALSE),
    ('study',               10,    'financial_year',     12,  FALSE, TRUE,  TRUE,  TRUE,  TRUE,
     'Exam timetable, admission letter, or equivalent institutional proof. '
     'Required before Executive approval can be granted.',                                         FALSE),
    ('maternity',           NULL,  NULL,                 NULL, FALSE, FALSE, FALSE, TRUE,  TRUE,
     'Supporting documentation required (e.g. clinic letter, birth certificate).',                 FALSE),
    ('adoption',            NULL,  NULL,                 NULL, FALSE, FALSE, FALSE, TRUE,  TRUE,
     'Court order, placement certificate or equivalent adoption documentation required.',          FALSE),
    ('parental',            NULL,  NULL,                 NULL, FALSE, FALSE, FALSE, TRUE,  TRUE,
     'Supporting documentation required. Policy duration is configurable per case.',               FALSE),
    ('unpaid',              NULL,  NULL,                 NULL, FALSE, FALSE, FALSE, TRUE,  FALSE, NULL,                                                                  FALSE),
    ('other',               NULL,  NULL,                 NULL, FALSE, FALSE, FALSE, TRUE,  FALSE, NULL,                                                                  TRUE)
) AS r(code, entitlement_days, cycle_basis, cycle_months, carryover_allowed,
       deducts_balance, tracks_entitlement, requires_executive_approval,
       requires_attachment, attachment_description, requires_reason)
JOIN leave_types lt ON lt.code = r.code
WHERE p.code = 'standard'
ON CONFLICT (leave_policy_id, leave_type_id) DO NOTHING;

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT lt.code, lt.name, r.entitlement_days, r.cycle_basis, r.deducts_balance,
--        r.tracks_entitlement, r.requires_attachment
--   FROM leave_policy_rules r
--   JOIN leave_types lt ON lt.id = r.leave_type_id
--   JOIN leave_policies p ON p.id = r.leave_policy_id
--  WHERE p.code = 'standard'
--  ORDER BY lt.display_order;
-- Expected: 9 rows matching the seeded values above.
