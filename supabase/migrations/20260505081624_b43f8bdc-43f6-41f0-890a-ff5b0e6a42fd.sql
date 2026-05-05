
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS trim_start numeric,
  ADD COLUMN IF NOT EXISTS trim_end numeric,
  ADD COLUMN IF NOT EXISTS music_url text,
  ADD COLUMN IF NOT EXISTS music_volume integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS clean_audio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS captions_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS export_quality text NOT NULL DEFAULT '1080p';

ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS broll_url text;

CREATE TABLE IF NOT EXISTS public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  quality text NOT NULL DEFAULT '1080p',
  progress integer NOT NULL DEFAULT 0,
  output_url text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own export jobs" ON public.export_jobs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own export jobs" ON public.export_jobs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own export jobs" ON public.export_jobs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own export jobs" ON public.export_jobs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_export_jobs_updated_at
  BEFORE UPDATE ON public.export_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public) VALUES ('music', 'music', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('brolls', 'brolls', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Music public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'music');

CREATE POLICY "Users upload own brolls" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brolls' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users view own brolls" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'brolls' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own brolls" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'brolls' AND auth.uid()::text = (storage.foldername(name))[1]);
