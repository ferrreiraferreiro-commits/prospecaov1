-- © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
-- Plano Times: o dono da conta (recurso 'times', liberado em Contas) convida até 10 pessoas.
-- Quem aceita passa a trabalhar no CRM do dono: as linhas continuam com user_id = dono,
-- e a regra de acesso deixa de ser "user_id = eu" e vira "user_id = conta_atual()".
-- Para quem não está em equipe, conta_atual() = auth.uid(): nada muda.
-- Os dados que a pessoa tinha antes de entrar ficam guardados e voltam se ela sair.

create table if not exists public.equipe_membros (
  membro uuid primary key references auth.users (id) on delete cascade,
  dono uuid not null references auth.users (id) on delete cascade,
  papel text not null default 'vendedor' check (papel in ('gestor', 'vendedor')),
  -- Vendedor vê todos os leads da conta ou só os que o dono passar para ele (fase 2)
  ve_todos boolean not null default true,
  convidado_em timestamptz not null default now(),
  aceito_em timestamptz,
  check (membro <> dono)
);
create index if not exists equipe_membros_dono on public.equipe_membros (dono);

alter table public.equipe_membros enable row level security;
drop policy if exists "equipe: quem participa vê" on public.equipe_membros;
create policy "equipe: quem participa vê" on public.equipe_membros for select to authenticated
  using (membro = (select auth.uid()) or dono = (select auth.uid()));
revoke all on public.equipe_membros from anon;
grant select on public.equipe_membros to authenticated;

-- ---------------------------------------------------------------------------
-- De quem é o CRM que a pessoa logada usa
-- ---------------------------------------------------------------------------

create or replace function public.conta_atual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.dono
       from public.equipe_membros m
       join public.profiles p on p.user_id = m.dono
      where m.membro = auth.uid() and m.aceito_em is not null and 'times' = any(p.recursos)),
    auth.uid());
$$;

-- 'dono' | 'gestor' | 'vendedor'
create or replace function public.meu_papel()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.conta_atual() = auth.uid() then 'dono'
    else (select m.papel from public.equipe_membros m where m.membro = auth.uid())
  end;
$$;

-- Plano que vale para a pessoa logada (o do dono, se ela está numa equipe).
-- Usado pelo gateway do WhatsApp e por api/maps.ts e api/meta.ts.
create or replace function public.meu_acesso()
returns table (conta uuid, usuario text, recursos text[], plano text, plano_ate timestamptz, teste_ate timestamptz, admin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.usuario, p.recursos, p.plano, p.plano_ate, p.teste_ate, coalesce(p.admin, false) and p.user_id = auth.uid()
  from public.profiles p
  where p.user_id = public.conta_atual();
$$;

revoke execute on function public.conta_atual() from public, anon;
revoke execute on function public.meu_papel() from public, anon;
revoke execute on function public.meu_acesso() from public, anon;
grant execute on function public.conta_atual() to authenticated;
grant execute on function public.meu_papel() to authenticated;
grant execute on function public.meu_acesso() to authenticated;

-- ---------------------------------------------------------------------------
-- Regras de acesso: tudo que era "do dono" passa a ser "da conta"
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'busca_google', 'client_notes', 'client_payments', 'clients', 'followups', 'funnels', 'imports',
    'interactions', 'leads', 'meetings', 'pricing_estimates', 'projects', 'settings', 'transactions'
  ] loop
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format(
      'create policy "dono" on public.%I for all to authenticated using ((select public.conta_atual()) = user_id) with check ((select public.conta_atual()) = user_id)',
      t);
    execute format('alter table public.%I alter column user_id set default public.conta_atual()', t);
  end loop;
end;
$$;

alter table public.meta_campanhas alter column user_id set default public.conta_atual();
drop policy if exists "meta_campanhas: dono" on public.meta_campanhas;
create policy "meta_campanhas: dono" on public.meta_campanhas for all to authenticated
  using (user_id = (select public.conta_atual())) with check (user_id = (select public.conta_atual()));

drop policy if exists "meta_conexoes: dono vê" on public.meta_conexoes;
create policy "meta_conexoes: dono vê" on public.meta_conexoes for select to authenticated
  using (user_id = (select public.conta_atual()));

drop policy if exists "meta_mensagens: dono vê" on public.meta_mensagens;
create policy "meta_mensagens: dono vê" on public.meta_mensagens for select to authenticated
  using (user_id = (select public.conta_atual()));
drop policy if exists "meta_mensagens: dono grava envio" on public.meta_mensagens;
create policy "meta_mensagens: dono grava envio" on public.meta_mensagens for insert to authenticated
  with check (user_id = (select public.conta_atual()) and de_mim);
drop policy if exists "meta_mensagens: dono marca lida" on public.meta_mensagens;
create policy "meta_mensagens: dono marca lida" on public.meta_mensagens for update to authenticated
  using (user_id = (select public.conta_atual())) with check (user_id = (select public.conta_atual()));

-- API oficial: a conexão é da conta; só dono e gestor trocam ou desconectam
create or replace function public.meta_salvar(p_numero_id text, p_waba_id text, p_token text, p_segredo text, p_numero text, p_nome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if public.meu_papel() = 'vendedor' then
    raise exception 'Só o dono ou um gestor da equipe muda a conexão.' using errcode = '42501';
  end if;
  insert into public.meta_conexoes (user_id, numero_id, waba_id, token, segredo_app, numero, nome_verificado)
  values (public.conta_atual(), p_numero_id, p_waba_id, p_token, p_segredo, p_numero, p_nome)
  on conflict (user_id) do update
    set numero_id = excluded.numero_id,
        waba_id = excluded.waba_id,
        token = excluded.token,
        segredo_app = excluded.segredo_app,
        numero = excluded.numero,
        nome_verificado = excluded.nome_verificado,
        atualizado_em = now();
end;
$$;

create or replace function public.meta_credenciais()
returns table (numero_id text, waba_id text, token text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.numero_id, c.waba_id, c.token from public.meta_conexoes c where c.user_id = public.conta_atual();
$$;

drop function if exists public.meta_desconectar();
create function public.meta_desconectar()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.meu_papel() = 'vendedor' then
    raise exception 'Só o dono ou um gestor da equipe desconecta.' using errcode = '42501';
  end if;
  delete from public.meta_conexoes where user_id = public.conta_atual();
end;
$$;
revoke execute on function public.meta_desconectar() from public, anon;
grant execute on function public.meta_desconectar() to authenticated;

-- ---------------------------------------------------------------------------
-- Equipe: tudo o que a tela Equipe precisa, numa chamada
-- ---------------------------------------------------------------------------

create or replace function public.minha_equipe()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_eu uuid := auth.uid();
  v_conta uuid := public.conta_atual();
begin
  if v_eu is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'conta', v_conta,
    'papel', public.meu_papel(),
    'times', exists (select 1 from public.profiles p where p.user_id = v_eu and 'times' = any(p.recursos)),
    'limite', 10,
    'dono', (select jsonb_build_object('id', p.user_id, 'nome', coalesce(p.nome, p.usuario, p.email))
               from public.profiles p where p.user_id = v_conta and v_conta <> v_eu),
    'convite', (select jsonb_build_object('dono', coalesce(p.nome, p.usuario, p.email), 'papel', m.papel)
                  from public.equipe_membros m join public.profiles p on p.user_id = m.dono
                 where m.membro = v_eu and m.aceito_em is null),
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.membro,
               'nome', coalesce(p.nome, p.usuario, p.email),
               'usuario', p.usuario,
               'email', case when v_conta = v_eu then p.email end,
               'papel', m.papel,
               've_todos', m.ve_todos,
               'aceito', m.aceito_em is not null) order by m.convidado_em)
        from public.equipe_membros m join public.profiles p on p.user_id = m.membro
       where m.dono = v_conta and (v_conta = v_eu or m.aceito_em is not null)), '[]'::jsonb)
  );
end;
$$;

-- Dono convida pelo usuário ou e-mail de uma conta que já existe
create or replace function public.equipe_convidar(p_login text, p_papel text default 'vendedor')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu uuid := auth.uid();
  v_alvo uuid;
begin
  if v_eu is null then
    raise exception 'Entre na sua conta.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = v_eu and 'times' = any(p.recursos)) then
    raise exception 'Sua conta não tem o plano Times.' using errcode = '42501';
  end if;
  if exists (select 1 from public.equipe_membros m where m.membro = v_eu) then
    raise exception 'Você faz parte de outra equipe. Saia dela antes de montar a sua.';
  end if;
  if p_papel not in ('gestor', 'vendedor') then
    raise exception 'Papel inválido.';
  end if;
  if (select count(*) from public.equipe_membros m where m.dono = v_eu) >= 10 then
    raise exception 'A equipe já tem 10 pessoas.';
  end if;
  select p.user_id into v_alvo
  from public.profiles p
  where lower(p.usuario) = lower(trim(p_login)) or lower(p.email) = lower(trim(p_login))
  limit 1;
  if v_alvo is null then
    raise exception 'Não achei ninguém com esse usuário ou e-mail. A pessoa precisa criar a conta dela na XS primeiro.';
  end if;
  if v_alvo = v_eu then
    raise exception 'Você já é o dono da equipe.';
  end if;
  if exists (select 1 from public.equipe_membros m where m.membro = v_alvo) then
    raise exception 'Essa pessoa já está em uma equipe (ou já tem um convite).';
  end if;
  if exists (select 1 from public.equipe_membros m where m.dono = v_alvo) then
    raise exception 'Essa pessoa é dona de outra equipe.';
  end if;
  insert into public.equipe_membros (membro, dono, papel) values (v_alvo, v_eu, p_papel);
end;
$$;

-- Quem foi convidado aceita ou recusa
create or replace function public.equipe_responder(p_aceitar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_aceitar then
    if exists (select 1 from public.equipe_membros m where m.dono = auth.uid()) then
      raise exception 'Você tem uma equipe. Tire as pessoas dela antes de entrar em outra.';
    end if;
    update public.equipe_membros set aceito_em = now() where membro = auth.uid() and aceito_em is null;
  else
    delete from public.equipe_membros where membro = auth.uid() and aceito_em is null;
  end if;
end;
$$;

-- Quem é da equipe sai dela (os dados que fez ficam com o dono)
create or replace function public.equipe_sair()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.equipe_membros where membro = auth.uid();
$$;

-- Dono tira alguém ou cancela um convite
create or replace function public.equipe_remover(p_membro uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.equipe_membros where membro = p_membro and dono = auth.uid();
$$;

-- Dono muda o papel de alguém
create or replace function public.equipe_definir(p_membro uuid, p_papel text, p_ve_todos boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_papel not in ('gestor', 'vendedor') then
    raise exception 'Papel inválido.';
  end if;
  update public.equipe_membros set papel = p_papel, ve_todos = coalesce(p_ve_todos, ve_todos)
  where membro = p_membro and dono = auth.uid();
end;
$$;

revoke execute on function public.minha_equipe() from public, anon;
revoke execute on function public.equipe_convidar(text, text) from public, anon;
revoke execute on function public.equipe_responder(boolean) from public, anon;
revoke execute on function public.equipe_sair() from public, anon;
revoke execute on function public.equipe_remover(uuid) from public, anon;
revoke execute on function public.equipe_definir(uuid, text, boolean) from public, anon;
grant execute on function public.minha_equipe() to authenticated;
grant execute on function public.equipe_convidar(text, text) to authenticated;
grant execute on function public.equipe_responder(boolean) to authenticated;
grant execute on function public.equipe_sair() to authenticated;
grant execute on function public.equipe_remover(uuid) to authenticated;
grant execute on function public.equipe_definir(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Tela Contas: o dono da XS liga ou desliga o plano Times de cada conta
-- ---------------------------------------------------------------------------

create or replace function public.admin_contas_times()
returns table (user_id uuid, times boolean, membros int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    raise exception 'Só o dono da XS vê as contas.' using errcode = '42501';
  end if;
  return query
    select p.user_id, 'times' = any(p.recursos),
           (select count(*)::int from public.equipe_membros m where m.dono = p.user_id and m.aceito_em is not null)
    from public.profiles p;
end;
$$;

create or replace function public.admin_definir_times(alvo uuid, ligar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    raise exception 'Só o dono da XS pode liberar o Times.' using errcode = '42501';
  end if;
  update public.profiles
  set recursos = case
        when ligar then (select array_agg(distinct r) from unnest(array_append(recursos, 'times')) r)
        else array_remove(recursos, 'times')
      end,
      updated_at = now()
  where user_id = alvo;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
end;
$$;

revoke execute on function public.admin_contas_times() from public, anon;
revoke execute on function public.admin_definir_times(uuid, boolean) from public, anon;
grant execute on function public.admin_contas_times() to authenticated;
grant execute on function public.admin_definir_times(uuid, boolean) to authenticated;
