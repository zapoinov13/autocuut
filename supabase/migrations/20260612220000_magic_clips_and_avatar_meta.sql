-- meta: гибкое хранение конфигурации (HeyGen, параметры Magic Clips и т.д.)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Сегменты Magic Clips, найденные AI в длинном видео
CREATE TABLE IF NOT EXISTS public.magic_clip_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  start_time numeric NOT NULL,
  end_time numeric NOT NULL,
  title text NOT NULL DEFAULT '',
  hook text NOT NULL DEFAULT '',
  viral_score integer,
  reason text,
  child_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.magic_clip_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own magic clip segments" ON public.magic_clip_segments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own magic clip segments" ON public.magic_clip_segments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own magic clip segments" ON public.magic_clip_segments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own magic clip segments" ON public.magic_clip_segments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.magic_clip_segments TO authenticated;
GRANT ALL ON public.magic_clip_segments TO service_role;

CREATE INDEX IF NOT EXISTS idx_magic_clip_segments_project ON public.magic_clip_segments(project_id, order_index);
