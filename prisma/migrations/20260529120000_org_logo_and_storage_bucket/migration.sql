-- Add logoUrl column to organizations
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;

-- Create Supabase Storage bucket for logos (public, 5 MB max, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'];

-- RLS: authenticated users can upload/update/delete their own org logo
-- (path convention: logos/{orgId}/logo.{ext})
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'logos_authenticated_write'
  ) THEN
    CREATE POLICY "logos_authenticated_write"
      ON storage.objects FOR ALL
      TO authenticated
      USING (bucket_id = 'logos')
      WITH CHECK (bucket_id = 'logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'logos_public_read'
  ) THEN
    CREATE POLICY "logos_public_read"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'logos');
  END IF;
END $$;
