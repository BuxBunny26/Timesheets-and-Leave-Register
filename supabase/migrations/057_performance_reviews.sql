-- 057_performance_reviews.sql
-- Employee performance reviews: annual, quarterly, probation, ad-hoc.
-- Reviewers are supervisors / managers / admins.
-- Employees can view their own reviews (via RLS).

CREATE TABLE IF NOT EXISTS performance_reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewer_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Period / type
  review_type      TEXT NOT NULL DEFAULT 'annual'
                   CHECK (review_type IN ('annual','quarterly','probation','ad_hoc')),
  review_period    TEXT NOT NULL,        -- free label, e.g. "FY2026 Annual"
  review_date      DATE NOT NULL,

  -- Scores 1–5 (NULL = not rated)
  overall_rating   INTEGER CHECK (overall_rating   BETWEEN 1 AND 5),
  technical_score  INTEGER CHECK (technical_score  BETWEEN 1 AND 5),
  teamwork_score   INTEGER CHECK (teamwork_score   BETWEEN 1 AND 5),
  reliability_score INTEGER CHECK (reliability_score BETWEEN 1 AND 5),
  safety_score     INTEGER CHECK (safety_score     BETWEEN 1 AND 5),

  -- Free-text
  strengths        TEXT,
  improvements     TEXT,
  goals_next       TEXT,
  notes            TEXT,

  -- Workflow
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','submitted','acknowledged')),
  acknowledged_at  TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_reviews_employee ON performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_reviewer ON performance_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_date     ON performance_reviews(review_date DESC);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_status   ON performance_reviews(status);

ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;

-- Supervisors/managers/admins can read all reviews
CREATE POLICY "supervisors read performance_reviews"
  ON performance_reviews FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('supervisor','manager','admin_manager','system_admin')
    )
    OR employee_id = auth.uid()   -- employees see their own
  );

-- Supervisors/managers/admins can write
CREATE POLICY "supervisors write performance_reviews"
  ON performance_reviews FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('supervisor','manager','admin_manager','system_admin')
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_performance_review_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_perf_review_updated_at
  BEFORE UPDATE ON performance_reviews
  FOR EACH ROW EXECUTE FUNCTION update_performance_review_updated_at();
