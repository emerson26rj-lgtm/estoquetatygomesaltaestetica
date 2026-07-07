ALTER TABLE public.anamneses
  ADD COLUMN IF NOT EXISTS peso numeric(5,2),
  ADD COLUMN IF NOT EXISTS altura numeric(4,2),
  ADD COLUMN IF NOT EXISTS medidas text;

COMMENT ON COLUMN public.anamneses.peso IS 'Peso em kg';
COMMENT ON COLUMN public.anamneses.altura IS 'Altura em metros';
COMMENT ON COLUMN public.anamneses.medidas IS 'Medidas corporais (cintura, quadril, etc)';
