
CREATE TABLE public.service_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_categories TO authenticated;
GRANT ALL ON public.service_categories TO service_role;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read service_categories" ON public.service_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write service_categories" ON public.service_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_minutes INT NOT NULL DEFAULT 0,
  category_id UUID REFERENCES public.service_categories(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read services" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write services" ON public.services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER services_set_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.service_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_products TO authenticated;
GRANT ALL ON public.service_products TO service_role;
ALTER TABLE public.service_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read service_products" ON public.service_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write service_products" ON public.service_products FOR ALL TO authenticated USING (true) WITH CHECK (true);
