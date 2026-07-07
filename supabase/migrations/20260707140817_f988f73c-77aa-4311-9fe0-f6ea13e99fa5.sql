
-- Admin can see all profiles/roles
CREATE POLICY "profiles_admin_read_all" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_read_all" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Clients
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cpf text,
  rg text,
  data_nascimento date,
  telefone text,
  email text,
  endereco text,
  cidade text,
  estado text,
  profissao text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_auth_all" ON public.clientes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER clientes_set_updated_at BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Anamneses
CREATE TABLE public.anamneses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data_atendimento date NOT NULL DEFAULT current_date,
  queixa_principal text,
  historico_saude text,
  alergias text,
  medicamentos text,
  cirurgias_previas text,
  gestante boolean DEFAULT false,
  fumante boolean DEFAULT false,
  hipertensao boolean DEFAULT false,
  diabetes boolean DEFAULT false,
  procedimentos_esteticos_previos text,
  contraindicacoes text,
  procedimento_realizado text,
  produtos_utilizados text,
  observacoes text,
  assinatura_cliente text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anamneses TO authenticated;
GRANT ALL ON public.anamneses TO service_role;
ALTER TABLE public.anamneses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anamneses_auth_all" ON public.anamneses FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER anamneses_set_updated_at BEFORE UPDATE ON public.anamneses
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_anamneses_cliente ON public.anamneses(cliente_id);
