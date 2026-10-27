-- © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
-- Plano Times: turnos ("Entrar em serviço") e quem da equipe está atendendo cada conversa.

create table if not exists public.equipe_turnos (
  id uuid primary key default gen_random_uuid(),
  conta uuid not null default public.conta_atual() references auth.users (id) on delete cascade,
  membro uuid not null default auth.uid() references auth.users (id) on delete cascade,
  inicio timestamptz not null default now(),
  fim timestamptz
);
create index if not exists equipe_turnos_conta on public.equipe_turnos (conta, inicio desc);
alter table public.equipe_turnos enable row level security;
drop policy if exists "turnos: equipe vê" on public.equipe_turnos;
create policy "turnos: equipe vê" on public.equipe_turnos for select to authenticated using (conta = (select public.conta_atual()));
drop policy if exists "turnos: cada um abre o seu" on public.equipe_turnos;
create policy "turnos: cada um abre o seu" on public.equipe_turnos for insert to authenticated
  with check (membro = (select auth.uid()) and conta = (select public.conta_atual()));
drop policy if exists "turnos: cada um fecha o seu" on public.equipe_turnos;
create policy "turnos: cada um fecha o seu" on public.equipe_turnos for update to authenticated
  using (membro = (select auth.uid())) with check (membro = (select auth.uid()));
revoke all on public.equipe_turnos from anon;
grant select, insert, update on public.equipe_turnos to authenticated;

-- Última pessoa da equipe que respondeu cada conversa (canal 'qr' = WhatsApp da XS, 'meta' = API oficial)
create table if not exists public.conversa_atendentes (
  conta uuid not null default public.conta_atual() references auth.users (id) on delete cascade,
  canal text not null check (canal in ('qr', 'meta')),
  telefone text not null,
  membro uuid not null default auth.uid() references auth.users (id) on delete cascade,
  em timestamptz not null default now(),
  primary key (conta, canal, telefone)
);
alter table public.conversa_atendentes enable row level security;
drop policy if exists "atendentes: conta" on public.conversa_atendentes;
create policy "atendentes: conta" on public.conversa_atendentes for all to authenticated
  using (conta = (select public.conta_atual())) with check (conta = (select public.conta_atual()) and membro = (select auth.uid()));
revoke all on public.conversa_atendentes from anon;
grant select, insert, update on public.conversa_atendentes to authenticated;
