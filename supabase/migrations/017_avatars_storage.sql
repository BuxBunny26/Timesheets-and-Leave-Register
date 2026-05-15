-- Avatars storage bucket and RLS policies
-- Creates the bucket and secures it so users can only manage their own folder.

-- Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Public read (anyone can view avatars)
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Authenticated users may upload to their own sub-folder (avatars/{user_id}/...)
CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users may update their own files
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users may delete their own files
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
