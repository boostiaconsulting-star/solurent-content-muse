CREATE TABLE IF NOT EXISTS public.branding (
  id text PRIMARY KEY DEFAULT 'default',
  website_url text,
  logo_url text,
  colors jsonb,
  fonts jsonb,
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all branding" ON public.branding FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.branding (id, website_url) VALUES ('default', 'https://www.solurent.mx')
ON CONFLICT (id) DO NOTHING;
