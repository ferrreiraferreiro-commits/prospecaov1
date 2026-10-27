-- © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
-- Plano Times, fases 2 a 4.
--   Fase 2: lead com responsável, roleta de leads novos, autor do histórico, metas por pessoa,
--           vendedor que só vê os leads dele (equipe_membros.ve_todos = false).
--   Fase 3: vários números da API oficial por conta (meta_conexoes.id; numero_id nas mensagens).
--   Fase 4: fila de envios no servidor (meta_fila, roda a cada minuto pelo pg_cron → api/meta.ts?fila=1),
--           agendadas e funis pela API oficial, e "SAIR" bloqueia o contato (meta_bloqueados).

-- ===========================================================================
-- Fase 2
-- ===========================================================================

alter table public.leads add column if not exists responsavel uuid references auth.users (id) on delete set null;
create index if not exists leads_responsavel on public.leads (user_id, responsavel);

alter table public.interactions add column if not exists autor uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.followups add column if not exists autor uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.meetings add column if not exists autor uuid default auth.uid() references auth.users (id) on delete set null;

alter table public.equipe_membros add column if not exists meta_contatos int;
alter table public.equipe_membros add column if not exists meta_vendas int;

create table if not exists public.equipe_config (
  dono uuid primary key references auth.users (id) on delete cascade,
  -- Leads novos vão um para cada vendedor, em rodízio
  roleta boolean not null default false,
  ultimo uuid
);
alter table public.equipe_config enable row level security;
drop policy if exists "equipe_config: equipe lê" on public.equipe_config;
create policy "equipe_config: equipe lê" on public.equipe_config for select to authenticated using (dono = (select public.conta_atual()));
revoke all on public.equipe_config from anon;
grant select on public.equipe_config to authenticated;

-- Vê todos os leads da conta? (dono, gestor e vendedor com ve_todos)
create or replace function public.vejo_todos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.meu_papel() <> 'vendedor'
      or coalesce((select m.ve_todos from public.equipe_membros m where m.membro = auth.uid()), true);
$$;
revoke execute on function public.vejo_todos() from public, anon;
grant execute on function public.vejo_todos() to authenticated;

drop policy if exists "dono" on public.leads;
create policy "dono" on public.leads for all to authenticated
  using ((select public.conta_atual()) = user_id and ((select public.vejo_todos()) or responsavel = (select auth.uid())))
  with check ((select public.conta_atual()) = user_id and ((select public.vejo_todos()) or responsavel = (select auth.uid())));

-- Próximo vendedor da roleta da conta
create or replace function public.proximo_da_roleta(p_conta uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ultimo uuid;
  v_prox uuid;
begin
  select c.ultimo into v_ultimo from public.equipe_config c where c.dono = p_conta for update;
  select m.membro into v_prox from public.equipe_membros m
   where m.dono = p_conta and m.aceito_em is not null and m.papel = 'vendedor' and (v_ultimo is null or m.membro > v_ultimo)
   order by m.membro limit 1;
  if v_prox is null then
    select m.membro into v_prox from public.equipe_membros m
     where m.dono = p_conta and m.aceito_em is not null and m.papel = 'vendedor'
     order by m.membro limit 1;
  end if;
  if v_prox is not null then
    update public.equipe_config set ultimo = v_prox where dono = p_conta;
  end if;
  return v_prox;
end;
$$;
revoke execute on function public.proximo_da_roleta(uuid) from public, anon, authenticated;

-- Lead novo sem responsável: vendedor que só vê os dele fica com o lead; senão, a roleta escolhe
create or replace function public.leads_responsavel_novo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.responsavel is null then
    if public.meu_papel() = 'vendedor' and not public.vejo_todos() then
      new.responsavel := auth.uid();
    elsif exists (select 1 from public.equipe_config c where c.dono = new.user_id and c.roleta) then
      new.responsavel := public.proximo_da_roleta(new.user_id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists leads_responsavel_novo on public.leads;
create trigger leads_responsavel_novo before insert on public.leads for each row execute function public.leads_responsavel_novo();

create or replace function public.equipe_roleta(p_ligar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.meu_papel() <> 'dono' or not exists (select 1 from public.profiles p where p.user_id = auth.uid() and 'times' = any(p.recursos)) then
    raise exception 'Só o dono da equipe liga a roleta.' using errcode = '42501';
  end if;
  insert into public.equipe_config (dono, roleta) values (auth.uid(), p_ligar)
  on conflict (dono) do update set roleta = excluded.roleta;
end;
$$;

create or replace function public.equipe_metas(p_membro uuid, p_contatos int, p_vendas int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.equipe_membros
  set meta_contatos = nullif(greatest(coalesce(p_contatos, 0), 0), 0),
      meta_vendas = nullif(greatest(coalesce(p_vendas, 0), 0), 0)
  where membro = p_membro and dono = auth.uid();
$$;

revoke execute on function public.equipe_roleta(boolean) from public, anon;
revoke execute on function public.equipe_metas(uuid, int, int) from public, anon;
grant execute on function public.equipe_roleta(boolean) to authenticated;
grant execute on function public.equipe_metas(uuid, int, int) to authenticated;

-- minha_equipe ganha roleta e metas
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
    've_todos', public.vejo_todos(),
    'times', exists (select 1 from public.profiles p where p.user_id = v_eu and 'times' = any(p.recursos)),
    'limite', 10,
    'roleta', coalesce((select c.roleta from public.equipe_config c where c.dono = v_conta), false),
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
               'aceito', m.aceito_em is not null,
               'meta_contatos', m.meta_contatos,
               'meta_vendas', m.meta_vendas) order by m.convidado_em)
        from public.equipe_membros m join public.profiles p on p.user_id = m.membro
       where m.dono = v_conta and (v_conta = v_eu or m.aceito_em is not null)), '[]'::jsonb)
  );
end;
$$;

-- ===========================================================================
-- Fase 3: vários números da API oficial
-- ===========================================================================

alter table public.meta_conexoes drop constraint if exists meta_conexoes_pkey;
alter table public.meta_conexoes add column if not exists id uuid not null default gen_random_uuid();
alter table public.meta_conexoes add primary key (id);
alter table public.meta_conexoes add column if not exists apelido text;
create unique index if not exists meta_conexoes_numero on public.meta_conexoes (user_id, numero_id);
grant select (id, apelido) on public.meta_conexoes to authenticated;

alter table public.meta_mensagens add column if not exists numero_id text;
alter table public.meta_campanhas add column if not exists numero_id text;

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
  on conflict (user_id, numero_id) do update
    set waba_id = excluded.waba_id,
        token = excluded.token,
        segredo_app = excluded.segredo_app,
        numero = excluded.numero,
        nome_verificado = excluded.nome_verificado,
        atualizado_em = now();
end;
$$;

drop function if exists public.meta_credenciais();
create function public.meta_credenciais(p_numero_id text default null)
returns table (numero_id text, waba_id text, token text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.numero_id, c.waba_id, c.token from public.meta_conexoes c
  where c.user_id = public.conta_atual() and (p_numero_id is null or c.numero_id = p_numero_id)
  order by c.criado_em limit 1;
$$;

drop function if exists public.meta_desconectar();
create function public.meta_desconectar(p_numero_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.meu_papel() = 'vendedor' then
    raise exception 'Só o dono ou um gestor da equipe desconecta.' using errcode = '42501';
  end if;
  delete from public.meta_conexoes where user_id = public.conta_atual() and (p_numero_id is null or numero_id = p_numero_id);
end;
$$;

create or replace function public.meta_apelido(p_numero_id text, p_apelido text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.meta_conexoes set apelido = nullif(left(trim(p_apelido), 40), '')
  where user_id = public.conta_atual() and numero_id = p_numero_id;
$$;

revoke execute on function public.meta_credenciais(text) from public, anon;
revoke execute on function public.meta_desconectar(text) from public, anon;
revoke execute on function public.meta_apelido(text, text) from public, anon;
grant execute on function public.meta_credenciais(text) to authenticated;
grant execute on function public.meta_desconectar(text) to authenticated;
grant execute on function public.meta_apelido(text, text) to authenticated;

-- ===========================================================================
-- Fase 4: bloqueados ("SAIR") e fila no servidor
-- ===========================================================================

create table if not exists public.meta_bloqueados (
  user_id uuid not null default public.conta_atual() references auth.users (id) on delete cascade,
  telefone text not null,
  em timestamptz not null default now(),
  primary key (user_id, telefone)
);
alter table public.meta_bloqueados enable row level security;
drop policy if exists "meta_bloqueados: conta" on public.meta_bloqueados;
create policy "meta_bloqueados: conta" on public.meta_bloqueados for all to authenticated
  using (user_id = (select public.conta_atual())) with check (user_id = (select public.conta_atual()));

create table if not exists public.meta_fila (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default public.conta_atual() references auth.users (id) on delete cascade,
  autor uuid default auth.uid() references auth.users (id) on delete set null,
  -- null = primeiro número conectado
  numero_id text,
  telefone text not null,
  nome text,
  lead_id text,
  tipo text not null check (tipo in ('texto', 'modelo')),
  texto text not null default '',
  modelo text,
  idioma text,
  nomes text[] not null default '{}',
  valores text[] not null default '{}',
  nomeadas boolean not null default false,
  -- agenda | funil
  origem text not null default 'agenda',
  funil text,
  enviar_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviada', 'falhou', 'cancelada', 'fora_janela', 'bloqueado')),
  erro text,
  enviada_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists meta_fila_vez on public.meta_fila (status, enviar_em);
create index if not exists meta_fila_conta on public.meta_fila (user_id, criado_em desc);
alter table public.meta_fila enable row level security;
drop policy if exists "meta_fila: conta" on public.meta_fila;
create policy "meta_fila: conta" on public.meta_fila for all to authenticated
  using (user_id = (select public.conta_atual())) with check (user_id = (select public.conta_atual()));

alter table public.xs_segredos add column if not exists meta_fila_chave text not null default encode(extensions.gen_random_bytes(24), 'hex');
insert into public.xs_segredos (id) select 1 where not exists (select 1 from public.xs_segredos);

-- Mesmo número? (o WhatsApp às vezes tira o 9 do celular brasileiro)
create or replace function public.mesmo_telefone(a text, b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select a = b or (left(a, 4) = left(b, 4) and right(a, 8) = right(b, 8));
$$;

-- api/meta.ts?fila=1 pega o que já está na hora (com a chave da fila)
create or replace function public.meta_fila_pegar(p_chave text)
returns table (id uuid, numero_id text, token text, telefone text, tipo text, texto text, modelo text, idioma text,
               nomes text[], valores text[], nomeadas boolean, janela boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_chave is null or p_chave is distinct from (select s.meta_fila_chave from public.xs_segredos s limit 1) then
    raise exception 'Chave da fila não confere.' using errcode = '28000';
  end if;
  -- Ficou "enviando" sem resposta: não arrisca mandar duas vezes
  update public.meta_fila f set status = 'falhou', erro = 'Sem resposta do envio.'
   where f.status = 'enviando' and f.enviar_em < now() - interval '15 minutes';
  update public.meta_fila f set status = 'bloqueado'
   where f.status = 'pendente' and f.enviar_em <= now()
     and exists (select 1 from public.meta_bloqueados b where b.user_id = f.user_id and public.mesmo_telefone(b.telefone, f.telefone));
  update public.meta_fila f set status = 'falhou', erro = 'Número da API oficial desconectado.'
   where f.status = 'pendente' and f.enviar_em <= now()
     and not exists (select 1 from public.meta_conexoes c where c.user_id = f.user_id and (f.numero_id is null or c.numero_id = f.numero_id));
  return query
    with vez as (
      select f.id from public.meta_fila f
       where f.status = 'pendente' and f.enviar_em <= now()
       order by f.enviar_em limit 40
       for update skip locked
    ), marcadas as (
      update public.meta_fila f set status = 'enviando' from vez where f.id = vez.id returning f.*
    )
    select m.id, c.numero_id, c.token, m.telefone, m.tipo, m.texto, m.modelo, m.idioma, m.nomes, m.valores, m.nomeadas,
           exists (select 1 from public.meta_mensagens mm
                    where mm.user_id = m.user_id and not mm.de_mim and mm.em > now() - interval '24 hours'
                      and public.mesmo_telefone(mm.telefone, m.telefone))
      from marcadas m
      join lateral (select c.numero_id, c.token from public.meta_conexoes c
                     where c.user_id = m.user_id and (m.numero_id is null or c.numero_id = m.numero_id)
                     order by c.criado_em limit 1) c on true;
end;
$$;

-- Resultado de cada envio da fila; o que saiu vai para as conversas
create or replace function public.meta_fila_resultado(p_chave text, p_id uuid, p_status text, p_wamid text, p_wa_id text, p_numero_id text, p_erro text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.meta_fila;
begin
  if p_chave is null or p_chave is distinct from (select s.meta_fila_chave from public.xs_segredos s limit 1) then
    raise exception 'Chave da fila não confere.' using errcode = '28000';
  end if;
  if p_status not in ('enviada', 'falhou', 'fora_janela') then
    raise exception 'Status inválido.';
  end if;
  update public.meta_fila set status = p_status, erro = left(p_erro, 300), enviada_em = case when p_status = 'enviada' then now() end
   where id = p_id and status = 'enviando'
  returning * into f;
  if found and p_status = 'enviada' then
    insert into public.meta_mensagens (user_id, numero_id, telefone, nome, de_mim, texto, modelo, wamid, status)
    values (f.user_id, p_numero_id, coalesce(nullif(p_wa_id, ''), f.telefone), f.nome, true, left(f.texto, 4096), f.modelo, p_wamid, 'accepted')
    on conflict (user_id, wamid) do nothing;
  end if;
end;
$$;

revoke execute on function public.meta_fila_pegar(text) from public;
revoke execute on function public.meta_fila_resultado(text, uuid, text, text, text, text, text) from public;
-- api/meta.ts chama sem login: a chave da fila (só no banco e no pg_cron) é a garantia
grant execute on function public.meta_fila_pegar(text) to anon, authenticated;
grant execute on function public.meta_fila_resultado(text, uuid, text, text, text, text, text) to anon, authenticated;

-- Webhook: acha o número certo da conta (o mesmo app da Meta manda os avisos de todos os números
-- para o mesmo endereço), grava numero_id e trata "SAIR"
create or replace function public.meta_receber(p_gancho uuid, p_corpo text, p_assinatura text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta public.meta_conexoes;
  v_numero text;
  dados jsonb;
  mudanca jsonb;
  valor jsonb;
  m jsonb;
  s jsonb;
  nomes jsonb;
  tipo text;
  texto text;
  midia text;
  v_tel text;
  n int := 0;
begin
  select * into conta from public.meta_conexoes where gancho = p_gancho;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  if p_assinatura is null
     or p_assinatura <> 'sha256=' || encode(extensions.hmac(convert_to(p_corpo, 'UTF8'), convert_to(conta.segredo_app, 'UTF8'), 'sha256'), 'hex') then
    raise exception 'Assinatura não confere.' using errcode = '28000';
  end if;

  dados := p_corpo::jsonb;

  for mudanca in select jsonb_array_elements(e -> 'changes') from jsonb_array_elements(coalesce(dados -> 'entry', '[]'::jsonb)) e loop
    valor := mudanca -> 'value';
    v_numero := valor -> 'metadata' ->> 'phone_number_id';
    -- Só números desta conta na XS
    if not exists (select 1 from public.meta_conexoes c where c.user_id = conta.user_id and c.numero_id = v_numero) then
      continue;
    end if;
    update public.meta_conexoes set webhook_ok_em = now() where user_id = conta.user_id and numero_id = v_numero;

    nomes := coalesce(valor -> 'contacts', '[]'::jsonb);

    for m in select jsonb_array_elements(coalesce(valor -> 'messages', '[]'::jsonb)) loop
      tipo := m ->> 'type';
      texto := case tipo
        when 'text' then m -> 'text' ->> 'body'
        when 'button' then m -> 'button' ->> 'text'
        when 'interactive' then coalesce(m -> 'interactive' -> 'button_reply' ->> 'title', m -> 'interactive' -> 'list_reply' ->> 'title')
        when 'image' then m -> 'image' ->> 'caption'
        when 'video' then m -> 'video' ->> 'caption'
        when 'document' then m -> 'document' ->> 'caption'
        else null
      end;
      midia := case tipo
        when 'image' then 'Foto'
        when 'video' then 'Vídeo'
        when 'audio' then 'Áudio'
        when 'document' then 'Documento'
        when 'sticker' then 'Figurinha'
        when 'location' then 'Localização'
        when 'contacts' then 'Contato'
        when 'text' then null
        when 'button' then null
        when 'interactive' then null
        else 'Mensagem'
      end;
      v_tel := regexp_replace(m ->> 'from', '\D', '', 'g');
      insert into public.meta_mensagens (user_id, numero_id, telefone, nome, de_mim, texto, midia, wamid, em)
      values (
        conta.user_id,
        v_numero,
        v_tel,
        (select c -> 'profile' ->> 'name' from jsonb_array_elements(nomes) c where c ->> 'wa_id' = m ->> 'from' limit 1),
        false,
        left(coalesce(texto, ''), 4096),
        midia,
        m ->> 'id',
        coalesce(to_timestamp((m ->> 'timestamp')::bigint), now())
      )
      on conflict (user_id, wamid) do nothing;
      -- "SAIR": não recebe mais disparos, funis nem agendadas
      if lower(trim(coalesce(texto, ''))) in ('sair', 'parar', 'pare', 'stop', 'cancelar', 'descadastrar') then
        insert into public.meta_bloqueados (user_id, telefone) values (conta.user_id, v_tel) on conflict do nothing;
        update public.meta_fila set status = 'bloqueado'
         where user_id = conta.user_id and status = 'pendente' and public.mesmo_telefone(telefone, v_tel);
      end if;
      n := n + 1;
    end loop;

    for s in select jsonb_array_elements(coalesce(valor -> 'statuses', '[]'::jsonb)) loop
      update public.meta_mensagens mm
      set status = case
            when s ->> 'status' = 'failed' then 'failed'
            when mm.status = 'read' then 'read'
            when s ->> 'status' = 'read' then 'read'
            when s ->> 'status' = 'delivered' then 'delivered'
            else coalesce(mm.status, 'accepted')
          end,
          erro = case when s ->> 'status' = 'failed' then left(coalesce(s -> 'errors' -> 0 ->> 'title', s -> 'errors' -> 0 ->> 'message', 'Falhou'), 300) else mm.erro end
      where mm.user_id = conta.user_id and mm.wamid = s ->> 'id';
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

-- A cada minuto, se tem envio na hora, chama a XS para mandar (pg_cron + pg_net)
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('xs-meta-fila') where exists (select 1 from cron.job where jobname = 'xs-meta-fila');
select cron.schedule('xs-meta-fila', '* * * * *', $cron$
  select net.http_post(
    url := 'https://xs-prospeccao.vercel.app/api/meta?fila=1',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-xs-fila', (select s.meta_fila_chave from public.xs_segredos s limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000)
  where exists (select 1 from public.meta_fila f where f.status = 'pendente' and f.enviar_em <= now());
$cron$);
