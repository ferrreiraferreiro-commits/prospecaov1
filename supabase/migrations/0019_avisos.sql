-- Avisos da XS: o dono escreve um aviso e ele aparece no sininho de todas as contas.
-- Todo mundo logado lê; só quem tem profiles.admin publica ou apaga (conferido aqui no banco).
-- Cada conta guarda até quando já viu os avisos (profiles.avisos_vistos_em) para mostrar os "novos".
-- Só acrescenta: apps antigos continuam funcionando.

create table if not exists public.avisos_xs (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 120),
  texto text not null default '' check (char_length(texto) <= 2000),
  link text check (link is null or link ~ '^https://'),
  criado_em timestamptz not null default now(),
  autor uuid default auth.uid() references auth.users (id) on delete set null
);

create index if not exists avisos_xs_criado_em on public.avisos_xs (criado_em desc);

alter table public.avisos_xs enable row level security;
drop policy if exists "todos leem" on public.avisos_xs;
create policy "todos leem" on public.avisos_xs for select to authenticated using (true);
drop policy if exists "dono publica" on public.avisos_xs;
create policy "dono publica" on public.avisos_xs for insert to authenticated with check ((select public.sou_admin()));
drop policy if exists "dono apaga" on public.avisos_xs;
create policy "dono apaga" on public.avisos_xs for delete to authenticated using ((select public.sou_admin()));

revoke all on public.avisos_xs from anon, authenticated;
grant select, delete on public.avisos_xs to authenticated;
grant insert (titulo, texto, link) on public.avisos_xs to authenticated;

alter table public.profiles add column if not exists avisos_vistos_em timestamptz;
grant update (avisos_vistos_em) on public.profiles to authenticated;
