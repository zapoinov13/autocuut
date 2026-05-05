ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'stories',
  ADD COLUMN IF NOT EXISTS subtitle_position text NOT NULL DEFAULT 'bottom';

ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS top_video_url text;