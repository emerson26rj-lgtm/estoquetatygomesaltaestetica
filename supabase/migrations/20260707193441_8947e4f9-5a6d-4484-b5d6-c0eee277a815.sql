
CREATE TABLE public.professionals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read professionals" ON public.professionals FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write professionals" ON public.professionals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER professionals_set_updated_at BEFORE UPDATE ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.services ADD COLUMN professional_ref_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL;
