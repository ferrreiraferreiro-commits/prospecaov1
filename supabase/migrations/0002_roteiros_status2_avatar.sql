-- Vários roteiros, Status 2, avatar e "zerar contadores".
alter table public.settings
  add column if not exists roteiros jsonb,
  add column if not exists roteiro_ativo text,
  add column if not exists status2_opcoes jsonb,
  add column if not exists avatar text,
  add column if not exists metricas_desde timestamptz;

alter table public.leads add column if not exists status2 text;
alter table public.interactions add column if not exists roteiro_id text;
