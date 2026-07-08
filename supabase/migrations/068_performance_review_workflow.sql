-- 068_performance_review_workflow.sql
-- Extends the performance_reviews table to support a multi-stage approval
-- workflow: draft → submitted → secondary_approved → final_approved → acknowledged
-- Also adds a `returned` status for reviews sent back for correction.
-- Supervisors are scoped to their direct reports via RLS.

-- ── 1. Extend the status constraint ──────────────────────────────────────────
ALTER TABLE performance_reviews
  DROP CONSTRAINT IF EXISTS performance_reviews_status_check;

ALTER TABLE performance_reviews
  ADD CONSTRAINT performance_reviews_status_check
  CHECK (status IN (
    'draft',
    'submitted',
    'secondary_approved',
    'final_approved',
    'returned',
    'acknowledged'
  ));

-- ── 2. Add workflow columns ───────────────────────────────────────────────────
ALTER TABLE performance_reviews
  ADD COLUMN IF NOT EXISTS supervisor_id               UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS secondary_approver_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS secondary_approved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS secondary_approval_comments TEXT,
  ADD COLUMN IF NOT EXISTS final_approver_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS final_approved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_approval_comments     TEXT,
  ADD COLUMN IF NOT EXISTS returned_by                 UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS returned_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_comments           TEXT,
  ADD COLUMN IF NOT EXISTS acknowledgement_comments    TEXT;
-- acknowledged_at was already added in migration 057

-- ── 3. Indexes on new FK columns ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_perf_reviews_secondary_approver
  ON performance_reviews(secondary_approver_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_final_approver
  ON performance_reviews(final_approver_id);

-- ── 4. Replace RLS policies with scoped access ────────────────────────────────

-- Drop all existing policies on the table
DROP POLICY IF EXISTS "supervisors read performance_reviews"         ON performance_reviews;
DROP POLICY IF EXISTS "supervisors insert performance_reviews"       ON performance_reviews;
DROP POLICY IF EXISTS "supervisors update performance_reviews"       ON performance_reviews;
DROP POLICY IF EXISTS "employees read own performance_reviews"       ON performance_reviews;
DROP POLICY IF EXISTS "admins manage all performance_reviews"        ON performance_reviews;

-- SELECT policy:
--   • Admins/managers: all reviews
--   • Supervisors: reviews they created OR reviews where they are secondary/final approver
--   • Employees: own reviews that are final_approved or acknowledged
CREATE POLICY "perf_reviews_select" ON performance_reviews
  FOR SELECT TO authenticated
  USING (
    -- Admin-level: see everything
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin_manager', 'system_admin')
    )
    OR
    -- Manager-level: see everything (to oversee their team chain)
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role = 'manager'
    )
    OR
    -- Supervisor: only reviews they authored OR are approving
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'supervisor'
      )
      AND (
        reviewer_id            = auth.uid()
        OR secondary_approver_id = auth.uid()
        OR final_approver_id     = auth.uid()
      )
    )
    OR
    -- Employees: their own reviews that are final_approved or acknowledged
    (
      employee_id = auth.uid()
      AND status IN ('final_approved', 'acknowledged')
    )
  );

-- INSERT policy:
--   • Supervisors may create reviews for their direct reports only
--   • Managers/admins may create for anyone
CREATE POLICY "perf_reviews_insert" ON performance_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Must be creating as themselves
    reviewer_id = auth.uid()
    AND (
      -- Admin / manager: create for anyone
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('manager', 'admin_manager', 'system_admin')
      )
      OR
      -- Supervisor: employee must be their direct report
      (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role = 'supervisor'
        )
        AND EXISTS (
          SELECT 1 FROM profiles
          WHERE id = employee_id
            AND supervisor_id = auth.uid()
        )
      )
    )
  );

-- UPDATE policy:
--   Anyone involved in the review (reviewer, secondary, final approver, employee for ack)
--   or an admin may update.  Fine-grained field-level locking is enforced in the application.
CREATE POLICY "perf_reviews_update" ON performance_reviews
  FOR UPDATE TO authenticated
  USING (
    reviewer_id              = auth.uid()
    OR secondary_approver_id = auth.uid()
    OR final_approver_id     = auth.uid()
    OR (employee_id = auth.uid() AND status IN ('final_approved', 'acknowledged'))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin_manager', 'system_admin')
    )
  );

-- DELETE policy: only admin or the reviewer while still in draft
CREATE POLICY "perf_reviews_delete" ON performance_reviews
  FOR DELETE TO authenticated
  USING (
    (reviewer_id = auth.uid() AND status = 'draft')
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin_manager', 'system_admin')
    )
  );
