-- Contas do XS: perfil, plano e recursos de cada usuário.
-- A linha nasce sozinha no cadastro (gatilho em auth.users). O usuário só pode
-- mudar nome, cidade e "já viu as boas-vindas"; plano, teste e recursos são do dono do XS.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  nome text,
  cidade text,
  -- teste | ativo | cancelado | vitalicio
  plano text not null default 'teste' check (plano in ('teste', 'ativo', 'cancelado', 'vitalicio')),
  teste_ate timestamptz not null default (now() + interval '14 days'),
  -- recursos extras liberados para a conta (ex.: 'motor' = busca no Maps e WhatsApp pelo Motor XS)
  recursos text[] not null default '{}',
  boas_vindas_feitas boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "dono le" on public.profiles;
create policy "dono le" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "dono edita" on public.profiles;
create policy "dono edita" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Só estas colunas podem ser alteradas pelo próprio usuário
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nome, cidade, boas_vindas_feitas, updated_at) on public.profiles to authenticated;

create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email) values (new.id, new.email) on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.criar_perfil() from public, anon, authenticated;

drop trigger if exists criar_perfil on auth.users;
create trigger criar_perfil after insert on auth.users for each row execute function public.criar_perfil();

-- Quem já usava o app antes das contas: acesso completo, sem teste, sem boas-vindas
insert into public.profiles (user_id, email, plano, recursos, boas_vindas_feitas)
select id, email, 'vitalicio', array['motor'], true from auth.users
on conflict (user_id) do nothing;
