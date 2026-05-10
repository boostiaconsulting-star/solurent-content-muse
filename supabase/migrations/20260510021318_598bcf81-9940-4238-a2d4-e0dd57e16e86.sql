CREATE TABLE IF NOT EXISTS public.publicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo TEXT,
  idea TEXT,
  angulo TEXT,
  formato TEXT,
  redes TEXT[],
  copy JSONB,
  imagen_url TEXT,
  fecha_programada TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'draft',
  origen TEXT NOT NULL DEFAULT 'ia' CHECK (origen IN ('ia','contenido_propio')),
  contenido_url TEXT,
  contenido_tipo TEXT CHECK (contenido_tipo IS NULL OR contenido_tipo IN ('video','imagen')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.biblioteca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.publicacion_contexto (
  publicacion_id UUID NOT NULL REFERENCES public.publicaciones(id) ON DELETE CASCADE,
  archivo_id UUID NOT NULL REFERENCES public.biblioteca(id) ON DELETE CASCADE,
  PRIMARY KEY (publicacion_id, archivo_id)
);

ALTER TABLE public.publicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biblioteca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicacion_contexto ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "public all publicaciones" ON public.publicaciones FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "public all biblioteca" ON public.biblioteca FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "public all publicacion_contexto" ON public.publicacion_contexto FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;