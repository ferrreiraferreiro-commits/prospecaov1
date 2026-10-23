-- © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
-- Contrato em PDF (Projetos): seus dados de contratada e as preferências do contrato ficam salvos nos Ajustes.
alter table public.settings add column if not exists contrato jsonb;
