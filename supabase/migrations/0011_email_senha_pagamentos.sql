-- Login só por e-mail, senha pelo app, WhatsApp de suporte e pagamentos da XS.

-- ---------------------------------------------------------------------------
-- E-mail de acesso: troca direto no Auth (sem link de confirmação), porque as contas
-- antigas têm um e-mail interno (@prospeccao.local) que não recebe nada.
-- ---------------------------------------------------------------------------
create or replace function public._trocar_email(alvo uuid, novo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(trim(novo));
begin
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Esse e-mail não parece válido.';
  end if;
  if e like '%@prospeccao.local' then
    raise exception 'Use um e-mail de verdade.';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = e and u.id <> alvo) then
    raise exception 'Esse e-mail já é de outra conta.';
  end if;
  update auth.users
  set email = e,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      email_change = '',
      email_change_token_new = '',
      updated_at = now()
  where id = alvo;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  update auth.identities
  set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(e)),
      updated_at = now()
  where user_id = alvo and provider = 'email';
  update public.profiles set email = e, updated_at = now() where user_id = alvo;
end;
$$;

revoke execute on function public._trocar_email(uuid, text) from public, anon, authenticated;

-- Conta antiga (login por nome) cadastra o próprio e-mail. Contas que já têm e-mail
-- de verdade não passam por aqui (trocar e-mail normal pede confirmação).
create or replace function public.definir_meu_email(novo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  atual text;
begin
  select u.email into atual from auth.users u where u.id = (select auth.uid());
  if atual is null or atual not like '%@prospeccao.local' then
    raise exception 'Sua conta já tem e-mail.';
  end if;
  perform public._trocar_email((select auth.uid()), novo);
end;
$$;

create or replace function public.admin_definir_email(alvo uuid, novo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    raise exception 'Só o dono da XS pode mudar e-mails.' using errcode = '42501';
  end if;
  perform public._trocar_email(alvo, novo);
end;
$$;

-- Senha nova para quem esqueceu (o dono gera e manda para a pessoa)
create or replace function public.admin_nova_senha(alvo uuid, senha text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    raise exception 'Só o dono da XS pode trocar senhas.' using errcode = '42501';
  end if;
  if length(coalesce(senha, '')) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(senha, extensions.gen_salt('bf')),
      updated_at = now()
  where id = alvo;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
end;
$$;

revoke execute on function public.definir_meu_email(text) from public, anon;
revoke execute on function public.admin_definir_email(uuid, text) from public, anon;
revoke execute on function public.admin_nova_senha(uuid, text) from public, anon;
grant execute on function public.definir_meu_email(text) to authenticated;
grant execute on function public.admin_definir_email(uuid, text) to authenticated;
grant execute on function public.admin_nova_senha(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Configuração da XS (uma linha): WhatsApp para renovar o plano
-- ---------------------------------------------------------------------------
create table if not exists public.xs_config (
  id int primary key default 1 check (id = 1),
  whatsapp_suporte text,
  updated_at timestamptz not null default now()
);
insert into public.xs_config (id) values (1) on conflict (id) do nothing;

alter table public.xs_config enable row level security;
drop policy if exists "todos leem" on public.xs_config;
create policy "todos leem" on public.xs_config for select to anon, authenticated using (true);
drop policy if exists "dono edita" on public.xs_config;
create policy "dono edita" on public.xs_config for update to authenticated using ((select public.sou_admin())) with check ((select public.sou_admin()));

revoke all on public.xs_config from anon, authenticated;
grant select on public.xs_config to anon, authenticated;
grant update (whatsapp_suporte, updated_at) on public.xs_config to authenticated;

-- ---------------------------------------------------------------------------
-- Pagamentos que o dono recebe de cada conta (anotados ao renovar)
-- ---------------------------------------------------------------------------
create table if not exists public.pagamentos_xs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  valor numeric(10, 2) not null check (valor >= 0),
  -- diario | semanal | mensal | trimestral | vitalicio | teste
  plano text not null,
  pago_em timestamptz not null default now(),
  obs text,
  created_at timestamptz not null default now()
);
create index if not exists pagamentos_xs_user_idx on public.pagamentos_xs (user_id, pago_em desc);

alter table public.pagamentos_xs enable row level security;
drop policy if exists "só o dono" on public.pagamentos_xs;
create policy "só o dono" on public.pagamentos_xs for all to authenticated using ((select public.sou_admin())) with check ((select public.sou_admin()));

revoke all on public.pagamentos_xs from anon, authenticated;
grant select, insert, delete on public.pagamentos_xs to authenticated;
