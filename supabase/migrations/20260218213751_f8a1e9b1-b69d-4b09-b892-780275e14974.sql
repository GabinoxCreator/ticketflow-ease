
CREATE TABLE public.event_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  anonymous_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_event_likes_event_id ON public.event_likes(event_id);
CREATE UNIQUE INDEX idx_event_likes_unique ON public.event_likes(event_id, anonymous_id);

ALTER TABLE public.event_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read likes" ON public.event_likes FOR SELECT USING (true);
CREATE POLICY "Anyone can insert likes" ON public.event_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete own likes" ON public.event_likes FOR DELETE USING (true);
