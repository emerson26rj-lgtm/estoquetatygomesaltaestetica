CREATE TABLE public.consent_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consent_templates TO authenticated;
GRANT ALL ON public.consent_templates TO service_role;
ALTER TABLE public.consent_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage consent_templates" ON public.consent_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER consent_templates_updated BEFORE UPDATE ON public.consent_templates FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.consent_templates(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  signature TEXT,
  signed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consents TO authenticated;
GRANT ALL ON public.consents TO service_role;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage consents" ON public.consents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER consents_updated BEFORE UPDATE ON public.consents FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();