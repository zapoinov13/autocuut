-- Music bucket security: ownership-scoped storage.objects policies.
-- The bucket is public (files are served via public URLs, which bypass RLS),
-- but without policies the storage API had no explicit owner-scoped access:
-- authenticated uploads were denied by default-deny RLS, and there was no
-- guarantee against future misconfiguration allowing writes to others' files.
-- App uploads music to "<user_id>/<filename>", so we scope by the first
-- path folder, consistent with the videos/audio/brolls/thumbnails buckets.

DROP POLICY IF EXISTS "Users upload own music" ON storage.objects;
CREATE POLICY "Users upload own music"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'music' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users update own music" ON storage.objects;
CREATE POLICY "Users update own music"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'music' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'music' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own music" ON storage.objects;
CREATE POLICY "Users delete own music"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'music' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- Owner-scoped SELECT lets users list their own uploaded tracks via the
-- storage API without re-enabling bucket-wide listing for everyone.
DROP POLICY IF EXISTS "Users read own music" ON storage.objects;
CREATE POLICY "Users read own music"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'music' AND (auth.uid())::text = (storage.foldername(name))[1]);
