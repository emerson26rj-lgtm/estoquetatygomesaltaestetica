
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  client_name TEXT,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  price NUMERIC(10,2),
  notes TEXT,
  google_event_id TEXT,
  google_calendar_id TEXT,
  google_sync_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX appointments_professional_starts_idx ON public.appointments (professional_id, starts_at);
CREATE INDEX appointments_starts_idx ON public.appointments (starts_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read appointments" ON public.appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write appointments" ON public.appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER appointments_set_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.professionals
  ADD COLUMN google_email TEXT,
  ADD COLUMN google_calendar_id TEXT,
  ADD COLUMN google_access_token TEXT,
  ADD COLUMN google_refresh_token TEXT,
  ADD COLUMN google_token_expires_at TIMESTAMPTZ,
  ADD COLUMN google_connected_at TIMESTAMPTZ;
