
-- SALES
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix','debito','credito','dinheiro')),
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  financial_account_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sales" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update sales" ON public.sales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin delete sales" ON public.sales FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER sales_set_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_sales_sold_at ON public.sales(sold_at DESC);

-- SALE ITEMS
CREATE TABLE public.sale_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sale_items" ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write sale_items" ON public.sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);

-- After a sale_item is inserted, deduct ficha técnica from stock automatically
CREATE OR REPLACE FUNCTION public.apply_sale_item_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sp RECORD;
  actor UUID;
BEGIN
  SELECT created_by INTO actor FROM public.sales WHERE id = NEW.sale_id;
  IF NEW.service_id IS NULL THEN RETURN NEW; END IF;
  FOR sp IN SELECT product_id, quantity FROM public.service_products WHERE service_id = NEW.service_id LOOP
    INSERT INTO public.movements (product_id, user_id, type, quantity, reason)
    VALUES (sp.product_id, actor, 'out', sp.quantity * NEW.quantity, 'Venda #' || NEW.sale_id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_sale_item_stock
AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.apply_sale_item_stock();

-- When a sale is deleted, remove linked financial account
CREATE OR REPLACE FUNCTION public.cleanup_sale_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.financial_account_id IS NOT NULL THEN
    DELETE FROM public.financial_accounts WHERE id = OLD.financial_account_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER tg_sales_cleanup
BEFORE DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.cleanup_sale_financials();
