-- Add AI-powered document classification fields to attachments
ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other'
    CHECK (category IN (
      'sick_note',
      'doctors_certificate',
      'medical_report',
      'leave_form',
      'id_document',
      'overtime_form',
      'payslip',
      'contract',
      'accident_report',
      'affidavit',
      'other'
    )),
  ADD COLUMN IF NOT EXISTS ai_display_name TEXT,
  ADD COLUMN IF NOT EXISTS ai_classified_at TIMESTAMPTZ;

-- Index for filtering by category in admin document view
CREATE INDEX IF NOT EXISTS idx_attachments_category ON attachments(category);
