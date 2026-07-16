
-- Categorias financeiras
CREATE TABLE public.financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('receita','despesa')),
  color text DEFAULT '#d97a8a',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_categories TO authenticated;
GRANT ALL ON public.financial_categories TO service_role;
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read fin_cat" ON public.financial_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert fin_cat" ON public.financial_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin manage fin_cat" ON public.financial_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Contas financeiras (a pagar e a receber)
CREATE TABLE public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('receita','despesa')),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  due_date date NOT NULL,
  payment_date date,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','atrasado','cancelado')),
  payment_method text,
  notes text,
  category_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_accounts TO authenticated;
GRANT ALL ON public.financial_accounts TO service_role;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read fin_acc" ON public.financial_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert fin_acc" ON public.financial_accounts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin update fin_acc" ON public.financial_accounts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete fin_acc" ON public.financial_accounts FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER tg_fin_acc_updated BEFORE UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_fin_acc_due ON public.financial_accounts(due_date);
CREATE INDEX idx_fin_acc_status ON public.financial_accounts(status);
CREATE INDEX idx_fin_acc_type ON public.financial_accounts(type);

-- Comissões
CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  service_amount numeric(12,2) NOT NULL DEFAULT 0,
  commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  reference_date date NOT NULL DEFAULT current_date,
  paid boolean NOT NULL DEFAULT false,
  paid_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read comm" ON public.commissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert comm" ON public.commissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin manage comm" ON public.commissions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete comm" ON public.commissions FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER tg_comm_updated BEFORE UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_comm_prof ON public.commissions(professional_id);
CREATE INDEX idx_comm_date ON public.commissions(reference_date);

-- Seed de categorias padrão
INSERT INTO public.financial_categories (name, type, color) VALUES
  ('Atendimentos', 'receita', '#10b981'),
  ('Venda de produtos', 'receita', '#059669'),
  ('Pacotes', 'receita', '#047857'),
  ('Compra de insumos', 'despesa', '#ef4444'),
  ('Aluguel', 'despesa', '#dc2626'),
  ('Salários / Comissões', 'despesa', '#b91c1c'),
  ('Marketing', 'despesa', '#f59e0b'),
  ('Outras despesas', 'despesa', '#6b7280');
