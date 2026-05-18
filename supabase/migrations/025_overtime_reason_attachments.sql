-- Add overtime_reason column to timesheet_days
ALTER TABLE timesheet_days ADD COLUMN IF NOT EXISTS overtime_reason TEXT;

-- =====================
-- Storage bucket: attachments
-- =====================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  10485760, -- 10 MB
  ARRAY[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- =====================
-- Storage RLS policies
-- =====================

-- Employees can upload to their own folder (employee_id is first path segment)
CREATE POLICY "attachments_storage_insert_own"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'attachments'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Employees can read their own files; admins can read all
CREATE POLICY "attachments_storage_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR is_admin()
  )
);

-- Employees can delete their own files; admins can delete all
CREATE POLICY "attachments_storage_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR is_admin()
  )
);

-- =====================
-- Attachments table RLS
-- =====================

-- Employees can see their own uploaded attachments; admins see all
CREATE POLICY "attachments_select"
ON attachments FOR SELECT
USING (
  uploaded_by = auth.uid()
  OR is_admin()
);

-- Authenticated users can insert their own
CREATE POLICY "attachments_insert"
ON attachments FOR INSERT
WITH CHECK (uploaded_by = auth.uid());

-- Employees can delete their own; admins can delete all
CREATE POLICY "attachments_delete"
ON attachments FOR DELETE
USING (
  uploaded_by = auth.uid()
  OR is_admin()
);
