
CREATE TABLE public.client_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  session_label text,
  photo_type text NOT NULL DEFAULT 'evolucao' CHECK (photo_type IN ('antes','depois','evolucao')),
  storage_path text NOT NULL,
  description text,
  taken_at date NOT NULL DEFAULT current_date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_photos TO authenticated;
GRANT ALL ON public.client_photos TO service_role;
ALTER TABLE public.client_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read photos" ON public.client_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert photos" ON public.client_photos FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "auth delete own or admin" ON public.client_photos FOR DELETE TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_client_photos_cliente ON public.client_photos(cliente_id);

ALTER TABLE public.anamneses
  ADD COLUMN IF NOT EXISTS assinatura_cliente text,
  ADD COLUMN IF NOT EXISTS assinatura_data timestamptz;

CREATE POLICY "auth read prontuario" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'prontuario');
CREATE POLICY "auth upload prontuario" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'prontuario' AND auth.uid() = owner);
CREATE POLICY "auth delete own prontuario" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'prontuario' AND (auth.uid() = owner OR public.has_role(auth.uid(),'admin')));
