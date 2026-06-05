GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'project_status') THEN
    GRANT USAGE ON TYPE public.project_status TO authenticated, service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'app_role') THEN
    GRANT USAGE ON TYPE public.app_role TO authenticated, service_role;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenes TO authenticated;
GRANT ALL ON public.scenes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subtitles TO authenticated;
GRANT ALL ON public.subtitles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.montage_clips TO authenticated;
GRANT ALL ON public.montage_clips TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.montage_segments TO authenticated;
GRANT ALL ON public.montage_segments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_jobs TO authenticated;
GRANT ALL ON public.export_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;