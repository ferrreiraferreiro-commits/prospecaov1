-- Nome de usuário: entra com usuário OU e-mail. No cadastro a pessoa escolhe os dois.
-- Contas antigas (login por nome) já têm usuário: é a parte antes do @prospeccao.local.

alter table public.profiles add column if not exists usuario text;
create unique index if not exists profiles_usuario_key on public.profiles (usuario);
alter table public.profiles drop constraint if exists profiles_usuario_formato;
-- not valid: não barra contas antigas com usuário fora do formato novo
alter table public.profiles add constraint profiles_usuario_formato check (usuario ~ '^[a-z0-9][a-z0-9._-]{2,29}$') not valid;

update public.profiles
set usuario = split_part(email, '@', 1)
where usuario is null and email like '%@prospeccao.local';

-- Formato: 3 a 30 letras minúsculas, números, ponto, traço ou sublinhado
create or replace function public._usuario_ok(u text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(u ~ '^[a-z0-9][a-z0-9._-]{2,29}$', false);
$$;

-- Tela de cadastro: o usuário está livre?
create or replace function public.usuario_disponivel(u text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._usuario_ok(lower(trim(u)))
     and not exists (select 1 from public.profiles p where p.usuario = lower(trim(u)));
$$;

-- Tela de entrar: e-mail do Auth para o usuário digitado (null se não existir)
create or replace function public.email_para_login(u text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select au.email
  from public.profiles p
  join auth.users au on au.id = p.user_id
  where p.usuario = lower(trim(u))
  limit 1;
$$;

-- Ajustes: escolher ou trocar o próprio usuário
create or replace function public.definir_meu_usuario(u text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := lower(trim(u));
begin
  if not public._usuario_ok(v) then
    raise exception 'Use de 3 a 30 letras minúsculas, números, ponto, traço ou sublinhado, sem espaço.';
  end if;
  if exists (select 1 from public.profiles p where p.usuario = v and p.user_id <> (select auth.uid())) then
    raise exception 'Esse usuário já está em uso.';
  end if;
  update public.profiles set usuario = v, updated_at = now() where user_id = (select auth.uid());
end;
$$;

revoke execute on function public._usuario_ok(text) from public, anon, authenticated;
revoke execute on function public.usuario_disponivel(text) from public;
revoke execute on function public.email_para_login(text) from public;
revoke execute on function public.definir_meu_usuario(text) from public, anon;
grant execute on function public.usuario_disponivel(text) to anon, authenticated;
grant execute on function public.email_para_login(text) to anon, authenticated;
grant execute on function public.definir_meu_usuario(text) to authenticated;

-- Cadastro: nome e usuário vêm dos metadados (se o usuário já estiver em uso, fica vazio)
create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u text := lower(trim(new.raw_user_meta_data ->> 'usuario'));
begin
  if not public._usuario_ok(u) or exists (select 1 from public.profiles p where p.usuario = u) then
    u := null;
  end if;
  insert into public.profiles (user_id, email, nome, usuario)
  values (new.id, new.email, nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), u)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.criar_perfil() from public, anon, authenticated;

-- Tela Contas passa a mostrar o usuário
drop function if exists public.admin_contas();
create function public.admin_contas()
returns table (
  user_id uuid,
  email text,
  usuario text,
  nome text,
  cidade text,
  plano text,
  ciclo text,
  teste_ate timestamptz,
  plano_ate timestamptz,
  admin boolean,
  created_at timestamptz,
  ultimo_acesso timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    raise exception 'Só o dono da XS pode ver as contas.' using errcode = '42501';
  end if;
  return query
    select p.user_id, p.email, p.usuario, p.nome, p.cidade, p.plano, p.ciclo, p.teste_ate, p.plano_ate, p.admin, p.created_at, u.last_sign_in_at
    from public.profiles p
    left join auth.users u on u.id = p.user_id
    order by p.created_at desc;
end;
$$;

revoke execute on function public.admin_contas() from public, anon;
grant execute on function public.admin_contas() to authenticated;
