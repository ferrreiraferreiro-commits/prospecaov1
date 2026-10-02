-- Mensagens de WhatsApp, tentativas automáticas, resultado da reunião e CNPJ.
-- Só acrescenta colunas; nada existente é alterado.
alter table public.settings
  add column if not exists mensagens jsonb,
  add column if not exists auto_tentativas boolean not null default true,
  add column if not exists max_tentativas integer not null default 5,
  add column if not exists disparo_limite_diario integer not null default 30;

alter table public.leads
  add column if not exists cnpj text,
  add column if not exists cnpj_info jsonb;

alter table public.meetings
  add column if not exists resultado text,
  add column if not exists valor numeric(12, 2),
  add column if not exists resultado_em timestamptz;
