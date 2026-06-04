
-- 1) Restrict profiles SELECT to own profile only
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2) Add UPDATE policies for private/thumbnail storage buckets
CREATE POLICY "Users update own videos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'videos' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'videos' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own brolls"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'brolls' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'brolls' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own audio"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'audio' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'audio' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own thumbnails"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'thumbnails' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'thumbnails' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 3) Prevent listing of public buckets via storage API. Public files remain
--    accessible via their direct public URLs (which bypass RLS).
DROP POLICY IF EXISTS "Music public read" ON storage.objects;
DROP POLICY IF EXISTS "Thumbnails public file read" ON storage.objects;

-- 4) Lock down SECURITY DEFINER functions from anon/authenticated execution.
--    Triggers run with table-owner privileges, so EXECUTE is not needed for users.
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
--    has_role is referenced inside RLS policies; revoke from anon but keep for authenticated.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
