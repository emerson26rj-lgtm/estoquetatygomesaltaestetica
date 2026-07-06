
-- Reverse stock on movement delete
CREATE OR REPLACE FUNCTION public.reverse_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.type = 'in' THEN
    UPDATE public.products SET quantity = quantity - OLD.quantity, updated_at = now() WHERE id = OLD.product_id;
  ELSE
    UPDATE public.products SET quantity = quantity + OLD.quantity, updated_at = now() WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS movements_apply ON public.movements;
CREATE TRIGGER movements_apply AFTER INSERT ON public.movements
FOR EACH ROW EXECUTE FUNCTION public.apply_movement();

DROP TRIGGER IF EXISTS movements_reverse ON public.movements;
CREATE TRIGGER movements_reverse AFTER DELETE ON public.movements
FOR EACH ROW EXECUTE FUNCTION public.reverse_movement();

-- Allow admins to delete movements
CREATE POLICY movements_delete_admin ON public.movements
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
