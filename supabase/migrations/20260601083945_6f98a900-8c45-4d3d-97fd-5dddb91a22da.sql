
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'single';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS audio_path text;

CREATE TABLE IF NOT EXISTS public.montage_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  duration numeric NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.montage_clips TO authenticated;
GRANT ALL ON public.montage_clips TO service_role;

ALTER TABLE public.montage_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own montage clips" ON public.montage_clips FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own montage clips" ON public.montage_clips FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own montage clips" ON public.montage_clips FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own montage clips" ON public.montage_clips FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.montage_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  clip_id uuid REFERENCES public.montage_clips(id) ON DELETE CASCADE,
  clip_in numeric NOT NULL DEFAULT 0,
  clip_out numeric NOT NULL DEFAULT 0,
  audio_start numeric NOT NULL DEFAULT 0,
  audio_end numeric NOT NULL DEFAULT 0,
  reason text,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.montage_segments TO authenticated;
GRANT ALL ON public.montage_segments TO service_role;

ALTER TABLE public.montage_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own montage segments" ON public.montage_segments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own montage segments" ON public.montage_segments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own montage segments" ON public.montage_segments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own montage segments" ON public.montage_segments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_montage_segments_updated_at
BEFORE UPDATE ON public.montage_segments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_montage_clips_project ON public.montage_clips(project_id, order_index);
CREATE INDEX IF NOT EXISTS idx_montage_segments_project ON public.montage_segments(project_id, order_index);

INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users read own audio" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own audio" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own audio" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
