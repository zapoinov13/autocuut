-- Thumbnails privacy: the bucket was public, but thumbnails are frames from
-- users' private videos (user-identifiable content). Make the bucket private
-- and scope SELECT to the owner, matching the videos/audio/brolls pattern.
-- The frontend now renders thumbnails via signed URLs instead of public URLs.

UPDATE storage.buckets SET public = false WHERE id = 'thumbnails';

DROP POLICY IF EXISTS "Users read own thumbnails" ON storage.objects;
CREATE POLICY "Users read own thumbnails"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'thumbnails' AND (auth.uid())::text = (storage.foldername(name))[1]);
