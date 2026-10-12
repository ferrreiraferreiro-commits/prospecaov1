-- Semana grátis: todo mundo usa a XS (com tudo, inclusive WhatsApp) até o fim de 19/10/2026 (horário de Brasília).
-- Só estica datas, nunca encurta: quem já tinha mais tempo continua igual.
-- Conta cancelada pelo dono continua bloqueada.
-- Depois do dia 19 volta sozinho ao normal (teste de 1 dia); não precisa desfazer nada.

-- Guarda as datas de antes, para poder voltar atrás se precisar.
create table if not exists public.promo_gratis_backup (
  user_id uuid primary key,
  plano text,
  teste_ate timestamptz,
  plano_ate timestamptz,
  salvo_em timestamptz not null default now()
);
alter table public.promo_gratis_backup enable row level security;

insert into public.promo_gratis_backup (user_id, plano, teste_ate, plano_ate)
select user_id, plano, teste_ate, plano_ate from public.profiles
on conflict (user_id) do nothing;

-- Quem está (ou estava) no teste: teste até o dia 19.
update public.profiles
set teste_ate = '2026-10-19 23:59:59-03', updated_at = now()
where plano = 'teste' and teste_ate < '2026-10-19 23:59:59-03';

-- Quem paga (ou deixou vencer): vale até o dia 19, no mínimo.
update public.profiles
set plano_ate = '2026-10-19 23:59:59-03', updated_at = now()
where plano = 'ativo' and plano_ate is not null and plano_ate < '2026-10-19 23:59:59-03';

-- Quem criar conta durante a semana também ganha até o dia 19; depois disso o default volta a ser 1 dia.
alter table public.profiles
  alter column teste_ate set default greatest(now() + interval '1 day', '2026-10-19 23:59:59-03'::timestamptz);
