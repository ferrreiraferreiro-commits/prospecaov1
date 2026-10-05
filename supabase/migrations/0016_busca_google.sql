-- Busca de empresas pelo Google (Places API) com a chave de cada usuário.
-- Cada conta guarda a própria chave e conta quantas consultas fez no mês, para a XS
-- parar antes da cota grátis do Google (1.000 por mês) e o usuário nunca ser cobrado.

create table if not exists public.busca_google (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  chave text,
  -- teto de consultas por mês (a cota grátis do Google é 1.000)
  limite integer not null default 950 check (limite between 0 and 100000),
  -- mês do contador (AAAA-MM) e consultas feitas nele
  mes text,
  usadas integer not null default 0 check (usadas >= 0),
  updated_at timestamptz not null default now()
);

alter table public.busca_google enable row level security;
drop policy if exists "dono" on public.busca_google;
create policy "dono" on public.busca_google for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.busca_google from anon;
grant select, insert, update, delete on public.busca_google to authenticated;
