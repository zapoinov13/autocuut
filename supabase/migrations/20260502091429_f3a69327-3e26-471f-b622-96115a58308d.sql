
-- Restrict EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Tighten thumbnails: limit public SELECT to objects under a user folder path (prevents naive listing of root)
DROP POLICY IF EXISTS "Thumbnails publicly readable" ON storage.objects;
CREATE POLICY "Thumbnails public file read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails' AND (storage.foldername(name))[1] IS NOT NULL);
