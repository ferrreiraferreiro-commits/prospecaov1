-- © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
-- Plano Times: cargo Desenvolvedor (quem faz os sites), fila de sites e chat da equipe.
-- O vendedor manda o lead para a fila; o desenvolvedor pega o serviço e só vê os leads da fila.

-- ---------------------------------------------------------------------------
-- Cargo novo
-- ---------------------------------------------------------------------------

do $$
declare
  c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.equipe_membros'::regclass and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%papel%'
  loop
    execute format('alter table public.equipe_membros drop constraint %I', c);
  end loop;
end;
$$;
alter table public.equipe_membros add constraint equipe_membros_papel_check check (papel in ('gestor', 'vendedor', 'desenvolvedor'));

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
  if p_papel not in ('gestor', 'vendedor', 'desenvolvedor') then
    raise exception 'Cargo inválido.';
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
  insert into public.equipe_membros (membro, dono, papel, ve_todos) values (v_alvo, v_eu, p_papel, false);
end;
$$;

create or replace function public.equipe_definir(p_membro uuid, p_papel text, p_ve_todos boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_papel not in ('gestor', 'vendedor', 'desenvolvedor') then
    raise exception 'Cargo inválido.';
  end if;
  update public.equipe_membros set papel = p_papel, ve_todos = coalesce(p_ve_todos, ve_todos)
  where membro = p_membro and dono = auth.uid();
end;
$$;

-- Desenvolvedor nunca vê todos os leads: só os que estão na fila de sites
create or replace function public.vejo_todos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.meu_papel()
    when 'desenvolvedor' then false
    when 'vendedor' then coalesce((select m.ve_todos from public.equipe_membros m where m.membro = auth.uid()), true)
    else true
  end;
$$;

-- Conexão da API oficial: vendedor e desenvolvedor não mudam
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
  if public.meu_papel() in ('vendedor', 'desenvolvedor') then
    raise exception 'Só o dono ou um gestor da equipe muda a conexão.' using errcode = '42501';
  end if;
  insert into public.meta_conexoes (user_id, numero_id, waba_id, token, segredo_app, numero, nome_verificado)
  values (public.conta_atual(), p_numero_id, p_waba_id, p_token, p_segredo, p_numero, p_nome)
  on conflict (user_id, numero_id) do update
    set waba_id = excluded.waba_id,
        token = excluded.token,
        segredo_app = excluded.segredo_app,
        numero = excluded.numero,
        nome_verificado = excluded.nome_verificado,
        atualizado_em = now();
end;
$$;

create or replace function public.meta_desconectar(p_numero_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.meu_papel() in ('vendedor', 'desenvolvedor') then
    raise exception 'Só o dono ou um gestor da equipe desconecta.' using errcode = '42501';
  end if;
  delete from public.meta_conexoes where user_id = public.conta_atual() and (p_numero_id is null or numero_id = p_numero_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fila de sites
-- ---------------------------------------------------------------------------

create table if not exists public.sites_pedidos (
  id uuid primary key default gen_random_uuid(),
  conta uuid not null default public.conta_atual() references auth.users (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  pedido_por uuid default auth.uid() references auth.users (id) on delete set null,
  pedido_em timestamptz not null default now(),
  -- O que o cliente quer (o vendedor escreve)
  briefing text check (char_length(briefing) <= 4000),
  prazo date,
  status text not null default 'fila' check (status in ('fila', 'fazendo', 'pronto')),
  dev uuid references auth.users (id) on delete set null,
  pego_em timestamptz,
  link text check (char_length(link) <= 500),
  pronto_em timestamptz,
  unique (conta, lead_id)
);
create index if not exists sites_pedidos_conta on public.sites_pedidos (conta, pedido_em desc);

alter table public.sites_pedidos enable row level security;
drop policy if exists "sites: equipe vê" on public.sites_pedidos;
create policy "sites: equipe vê" on public.sites_pedidos for select to authenticated using (conta = (select public.conta_atual()));
drop policy if exists "sites: quem vende pede" on public.sites_pedidos;
create policy "sites: quem vende pede" on public.sites_pedidos for insert to authenticated
  with check (conta = (select public.conta_atual()) and (select public.meu_papel()) <> 'desenvolvedor');
-- Desenvolvedor só mexe no que está livre ou com ele; os outros mexem em tudo
drop policy if exists "sites: atualizar" on public.sites_pedidos;
create policy "sites: atualizar" on public.sites_pedidos for update to authenticated
  using (conta = (select public.conta_atual()) and ((select public.meu_papel()) <> 'desenvolvedor' or dev is null or dev = (select auth.uid())))
  with check (conta = (select public.conta_atual()) and ((select public.meu_papel()) <> 'desenvolvedor' or dev is null or dev = (select auth.uid())));
drop policy if exists "sites: tirar da fila" on public.sites_pedidos;
create policy "sites: tirar da fila" on public.sites_pedidos for delete to authenticated
  using (conta = (select public.conta_atual()) and (select public.meu_papel()) <> 'desenvolvedor');
revoke all on public.sites_pedidos from anon;
grant select, insert, update, delete on public.sites_pedidos to authenticated;

-- O lead está na fila de sites da conta? (o desenvolvedor vê esses leads)
create or replace function public.lead_na_fila(p_lead uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.sites_pedidos s where s.lead_id = p_lead and s.conta = public.conta_atual());
$$;
revoke execute on function public.lead_na_fila(uuid) from public, anon;
grant execute on function public.lead_na_fila(uuid) to authenticated;

drop policy if exists "dono" on public.leads;
create policy "dono" on public.leads for all to authenticated
  using ((select public.conta_atual()) = user_id and ((select public.vejo_todos()) or responsavel = (select auth.uid())
         or ((select public.meu_papel()) = 'desenvolvedor' and public.lead_na_fila(id))))
  with check ((select public.conta_atual()) = user_id and ((select public.vejo_todos()) or responsavel = (select auth.uid())
         or ((select public.meu_papel()) = 'desenvolvedor' and public.lead_na_fila(id))));

-- ---------------------------------------------------------------------------
-- Chat da equipe
-- ---------------------------------------------------------------------------

create table if not exists public.equipe_chat (
  id uuid primary key default gen_random_uuid(),
  conta uuid not null default public.conta_atual() references auth.users (id) on delete cascade,
  -- null = aviso automático da XS (ex.: "pegou o site de…")
  autor uuid default auth.uid() references auth.users (id) on delete set null,
  texto text not null check (char_length(texto) between 1 and 2000),
  lead_id uuid references public.leads (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists equipe_chat_conta on public.equipe_chat (conta, criado_em desc);

alter table public.equipe_chat enable row level security;
drop policy if exists "chat: equipe lê" on public.equipe_chat;
create policy "chat: equipe lê" on public.equipe_chat for select to authenticated using (conta = (select public.conta_atual()));
drop policy if exists "chat: cada um escreve o seu" on public.equipe_chat;
create policy "chat: cada um escreve o seu" on public.equipe_chat for insert to authenticated
  with check (conta = (select public.conta_atual()) and autor = (select auth.uid()));
drop policy if exists "chat: apaga a própria" on public.equipe_chat;
create policy "chat: apaga a própria" on public.equipe_chat for delete to authenticated
  using (conta = (select public.conta_atual()) and (autor = (select auth.uid()) or (select public.meu_papel()) = 'dono'));
revoke all on public.equipe_chat from anon;
grant select, insert, delete on public.equipe_chat to authenticated;

-- Avisos automáticos no chat quando um site entra na fila, é pego ou fica pronto
create or replace function public.sites_aviso_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa text := (select l.empresa from public.leads l where l.id = new.lead_id);
  v_quem text;
  v_texto text;
begin
  if tg_op = 'INSERT' then
    v_quem := (select coalesce(p.nome, p.usuario) from public.profiles p where p.user_id = new.pedido_por);
    v_texto := format('%s mandou o site de %s para a fila.', coalesce(v_quem, 'Alguém'), coalesce(v_empresa, 'um lead'));
  elsif new.status is distinct from old.status or new.dev is distinct from old.dev then
    v_quem := (select coalesce(p.nome, p.usuario) from public.profiles p where p.user_id = coalesce(new.dev, old.dev));
    v_texto := case
      when new.status = 'pronto' then format('%s terminou o site de %s.', coalesce(v_quem, 'Alguém'), coalesce(v_empresa, 'um lead'))
      when new.status = 'fazendo' and new.dev is not null then format('%s pegou o site de %s.', coalesce(v_quem, 'Alguém'), coalesce(v_empresa, 'um lead'))
      when new.status = 'fila' and old.dev is not null then format('%s devolveu o site de %s para a fila.', coalesce(v_quem, 'Alguém'), coalesce(v_empresa, 'um lead'))
    end;
  end if;
  if v_texto is not null then
    insert into public.equipe_chat (conta, autor, texto, lead_id) values (new.conta, null, v_texto, new.lead_id);
  end if;
  return new;
end;
$$;
drop trigger if exists sites_aviso_chat on public.sites_pedidos;
create trigger sites_aviso_chat after insert or update on public.sites_pedidos for each row execute function public.sites_aviso_chat();

-- Desenvolvedor vê os leads da fila, mas não apaga
drop policy if exists "desenvolvedor não apaga" on public.leads;
create policy "desenvolvedor não apaga" on public.leads as restrictive for delete to authenticated
  using ((select public.meu_papel()) <> 'desenvolvedor');
