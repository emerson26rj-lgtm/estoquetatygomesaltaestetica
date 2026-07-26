-- 1) Sessões de caixa
CREATE TABLE public.cash_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'open',
  opening_amount NUMERIC NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_by UUID,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  counted_amount NUMERIC,
  expected_amount NUMERIC,
  difference NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_sessions TO authenticated;
GRANT ALL ON public.cash_sessions TO service_role;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read cash_sessions" ON public.cash_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert cash_sessions" ON public.cash_sessions FOR INSERT TO authenticated WITH CHECK (opened_by = auth.uid());
CREATE POLICY "auth update cash_sessions" ON public.cash_sessions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin delete cash_sessions" ON public.cash_sessions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER tg_cash_sessions_updated BEFORE UPDATE ON public.cash_sessions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- garante no máximo uma sessão aberta
CREATE UNIQUE INDEX cash_sessions_single_open ON public.cash_sessions ((status)) WHERE status = 'open';

-- 2) Sangrias e suprimentos
CREATE TABLE public.cash_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read cash_movements" ON public.cash_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert cash_movements" ON public.cash_movements FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "auth delete cash_movements" ON public.cash_movements FOR DELETE TO authenticated USING (true);

-- 3) Vendas: vínculo com caixa, desconto e status
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid';

-- 4) Itens de venda podem ser produtos de revenda
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'service';

-- 5) Comissão do profissional
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS commission_percent NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE;

-- 6) Agenda -> venda
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;

-- 7) Baixa de estoque: serviços (ficha técnica) e produtos de revenda + comissão
CREATE OR REPLACE FUNCTION public.apply_sale_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sp RECORD;
  actor UUID;
  prof UUID;
  pct NUMERIC;
  sdate DATE;
BEGIN
  SELECT created_by, professional_id, sold_at::date INTO actor, prof, sdate FROM public.sales WHERE id = NEW.sale_id;

  IF NEW.product_id IS NOT NULL THEN
    INSERT INTO public.movements (product_id, user_id, type, quantity, reason)
    VALUES (NEW.product_id, actor, 'out', NEW.quantity, 'Venda de produto #' || NEW.sale_id);
  END IF;

  IF NEW.service_id IS NOT NULL THEN
    FOR sp IN SELECT product_id, quantity FROM public.service_products WHERE service_id = NEW.service_id LOOP
      INSERT INTO public.movements (product_id, user_id, type, quantity, reason)
      VALUES (sp.product_id, actor, 'out', sp.quantity * NEW.quantity, 'Venda #' || NEW.sale_id);
    END LOOP;

    IF prof IS NOT NULL THEN
      SELECT commission_percent INTO pct FROM public.professionals WHERE id = prof;
      IF pct IS NOT NULL AND pct > 0 THEN
        INSERT INTO public.commissions (professional_id, sale_id, service_id, service_amount, commission_percent, commission_amount, reference_date, created_by)
        VALUES (prof, NEW.sale_id, NEW.service_id, NEW.subtotal, pct, ROUND(NEW.subtotal * pct / 100.0, 2), COALESCE(sdate, CURRENT_DATE), actor);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_sale_item_stock ON public.sale_items;
CREATE TRIGGER tg_sale_item_stock AFTER INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.apply_sale_item_stock();

-- reaplica triggers de estoque/financeiro que já existiam nas funções
DROP TRIGGER IF EXISTS tg_movements_apply ON public.movements;
CREATE TRIGGER tg_movements_apply AFTER INSERT ON public.movements FOR EACH ROW EXECUTE FUNCTION public.apply_movement();
DROP TRIGGER IF EXISTS tg_movements_reverse ON public.movements;
CREATE TRIGGER tg_movements_reverse BEFORE DELETE ON public.movements FOR EACH ROW EXECUTE FUNCTION public.reverse_movement();
DROP TRIGGER IF EXISTS tg_sales_cleanup ON public.sales;
CREATE TRIGGER tg_sales_cleanup BEFORE DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.cleanup_sale_financials();

-- 8) Estorno de venda: devolve insumos ao estoque
CREATE OR REPLACE FUNCTION public.reverse_sale_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sp RECORD;
  actor UUID;
BEGIN
  SELECT created_by INTO actor FROM public.sales WHERE id = OLD.sale_id;

  IF OLD.product_id IS NOT NULL THEN
    INSERT INTO public.movements (product_id, user_id, type, quantity, reason)
    VALUES (OLD.product_id, actor, 'in', OLD.quantity, 'Estorno venda #' || OLD.sale_id);
  END IF;

  IF OLD.service_id IS NOT NULL THEN
    FOR sp IN SELECT product_id, quantity FROM public.service_products WHERE service_id = OLD.service_id LOOP
      INSERT INTO public.movements (product_id, user_id, type, quantity, reason)
      VALUES (sp.product_id, actor, 'in', sp.quantity * OLD.quantity, 'Estorno venda #' || OLD.sale_id);
    END LOOP;
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS tg_sale_item_reverse ON public.sale_items;
CREATE TRIGGER tg_sale_item_reverse BEFORE DELETE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.reverse_sale_item_stock();