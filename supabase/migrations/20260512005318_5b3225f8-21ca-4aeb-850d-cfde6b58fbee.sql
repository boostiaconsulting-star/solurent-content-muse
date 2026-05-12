
INSERT INTO storage.buckets (id, name, public)
VALUES ('biblioteca', 'biblioteca', true), ('contenido_propio', 'contenido_propio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='public read biblioteca contenido') THEN
    CREATE POLICY "public read biblioteca contenido" ON storage.objects FOR SELECT USING (bucket_id IN ('biblioteca','contenido_propio'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='public insert biblioteca contenido') THEN
    CREATE POLICY "public insert biblioteca contenido" ON storage.objects FOR INSERT WITH CHECK (bucket_id IN ('biblioteca','contenido_propio'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='public update biblioteca contenido') THEN
    CREATE POLICY "public update biblioteca contenido" ON storage.objects FOR UPDATE USING (bucket_id IN ('biblioteca','contenido_propio'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='public delete biblioteca contenido') THEN
    CREATE POLICY "public delete biblioteca contenido" ON storage.objects FOR DELETE USING (bucket_id IN ('biblioteca','contenido_propio'));
  END IF;
END $$;
