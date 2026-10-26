-- API oficial do WhatsApp (Meta / WhatsApp Cloud API): segunda forma de usar o WhatsApp na XS.
-- Não mexe no WhatsApp da XS (QR code, na VPS): é uma área separada, com Conexão, Conversas e Disparo próprios.
-- Cada conta usa o próprio app da Meta (a Meta cobra a pessoa direto); a XS só guarda as credenciais,
-- recebe o webhook (api/meta.ts → meta_receber) e envia pela Graph API em nome da conta.

-- Credenciais da conta (uma por usuário)
create table if not exists public.meta_conexoes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Identifica a conta no endereço do webhook (/api/meta?c=…), sem expor o user_id
  gancho uuid not null unique default gen_random_uuid(),
  -- "Token de verificação" que a pessoa cola no painel da Meta
  verificacao text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  numero_id text not null,
  waba_id text not null,
  token text not null,
  segredo_app text not null,
  numero text,
  nome_verificado text,
  webhook_ok_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.meta_conexoes enable row level security;

-- A pessoa vê só a própria linha, e sem o token nem a chave secreta (essas só a função api/meta.ts lê, por meta_credenciais)
drop policy if exists "meta_conexoes: dono vê" on public.meta_conexoes;
create policy "meta_conexoes: dono vê" on public.meta_conexoes for select to authenticated using (user_id = auth.uid());
revoke all on public.meta_conexoes from anon, authenticated;
grant select (user_id, gancho, verificacao, numero_id, waba_id, numero, nome_verificado, webhook_ok_em, criado_em, atualizado_em)
  on public.meta_conexoes to authenticated;

-- Mensagens (entrada e saída). Só o que passa pela API oficial: nada do WhatsApp da XS.
create table if not exists public.meta_mensagens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- wa_id do contato (só dígitos, com 55), como a Meta devolve
  telefone text not null,
  nome text,
  de_mim boolean not null,
  texto text not null default '',
  midia text,
  -- Nome do modelo aprovado, quando a mensagem saiu como modelo
  modelo text,
  wamid text,
  status text check (status in ('accepted', 'delivered', 'read', 'failed')),
  erro text,
  lida boolean not null default false,
  campanha_id uuid,
  em timestamptz not null default now()
);

create unique index if not exists meta_mensagens_wamid on public.meta_mensagens (user_id, wamid);
create index if not exists meta_mensagens_conversa on public.meta_mensagens (user_id, telefone, em desc);
create index if not exists meta_mensagens_campanha on public.meta_mensagens (campanha_id) where campanha_id is not null;

alter table public.meta_mensagens enable row level security;

drop policy if exists "meta_mensagens: dono vê" on public.meta_mensagens;
create policy "meta_mensagens: dono vê" on public.meta_mensagens for select to authenticated using (user_id = auth.uid());
-- Mensagens enviadas (api/meta.ts grava com o login da pessoa)
drop policy if exists "meta_mensagens: dono grava envio" on public.meta_mensagens;
create policy "meta_mensagens: dono grava envio" on public.meta_mensagens for insert to authenticated with check (user_id = auth.uid() and de_mim);
-- Marcar como lida
drop policy if exists "meta_mensagens: dono marca lida" on public.meta_mensagens;
create policy "meta_mensagens: dono marca lida" on public.meta_mensagens for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.meta_mensagens from anon, authenticated;
grant select, insert on public.meta_mensagens to authenticated;
grant update (lida) on public.meta_mensagens to authenticated;

-- Campanhas de disparo por modelo aprovado
create table if not exists public.meta_campanhas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  modelo text not null,
  idioma text not null,
  -- Nomes das variáveis do corpo do modelo ("1", "2"… ou nomes) e se são nomeadas
  variaveis text[] not null default '{}',
  nomeadas boolean not null default false,
  -- [{ telefone, nome, lead_id, valores: string[], texto }]
  destinatarios jsonb not null default '[]'::jsonb,
  total int not null default 0,
  criado_em timestamptz not null default now()
);

alter table public.meta_campanhas enable row level security;
drop policy if exists "meta_campanhas: dono" on public.meta_campanhas;
create policy "meta_campanhas: dono" on public.meta_campanhas for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.meta_campanhas from anon, authenticated;
grant select, insert, delete on public.meta_campanhas to authenticated;

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- Salva (ou troca) as credenciais da conta logada. api/meta.ts só chama depois de testar tudo na Meta.
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
  insert into public.meta_conexoes (user_id, numero_id, waba_id, token, segredo_app, numero, nome_verificado)
  values (auth.uid(), p_numero_id, p_waba_id, p_token, p_segredo, p_numero, p_nome)
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

-- Credenciais da conta logada, para api/meta.ts enviar em nome dela
create or replace function public.meta_credenciais()
returns table (numero_id text, waba_id text, token text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.numero_id, c.waba_id, c.token from public.meta_conexoes c where c.user_id = auth.uid();
$$;

-- Desconecta (apaga as credenciais). As conversas e campanhas ficam.
create or replace function public.meta_desconectar()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.meta_conexoes where user_id = auth.uid();
$$;

-- Verificação do webhook (GET da Meta com hub.verify_token)
create or replace function public.meta_verificar(p_gancho uuid, p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.meta_conexoes c where c.gancho = p_gancho and c.verificacao = p_token);
$$;

-- Avisos da Meta (POST do webhook). Confere a assinatura X-Hub-Signature-256 com a chave secreta do app da conta,
-- grava as mensagens que chegaram e atualiza o status (entregue, lida, falhou) das que saíram.
create or replace function public.meta_receber(p_gancho uuid, p_corpo text, p_assinatura text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta public.meta_conexoes;
  dados jsonb;
  mudanca jsonb;
  valor jsonb;
  m jsonb;
  s jsonb;
  nomes jsonb;
  tipo text;
  texto text;
  midia text;
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
  update public.meta_conexoes set webhook_ok_em = now() where user_id = conta.user_id;

  for mudanca in select jsonb_array_elements(e -> 'changes') from jsonb_array_elements(coalesce(dados -> 'entry', '[]'::jsonb)) e loop
    valor := mudanca -> 'value';
    -- Avisos de outro número da mesma conta Business ficam de fora
    if valor -> 'metadata' ->> 'phone_number_id' is distinct from conta.numero_id then
      continue;
    end if;

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
      insert into public.meta_mensagens (user_id, telefone, nome, de_mim, texto, midia, wamid, em)
      values (
        conta.user_id,
        regexp_replace(m ->> 'from', '\D', '', 'g'),
        (select c -> 'profile' ->> 'name' from jsonb_array_elements(nomes) c where c ->> 'wa_id' = m ->> 'from' limit 1),
        false,
        left(coalesce(texto, ''), 4096),
        midia,
        m ->> 'id',
        coalesce(to_timestamp((m ->> 'timestamp')::bigint), now())
      )
      on conflict (user_id, wamid) do nothing;
      n := n + 1;
    end loop;

    for s in select jsonb_array_elements(coalesce(valor -> 'statuses', '[]'::jsonb)) loop
      -- Nunca volta de "lida" para "entregue" (a Meta pode mandar fora de ordem)
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

revoke execute on function public.meta_salvar(text, text, text, text, text, text) from public, anon;
revoke execute on function public.meta_credenciais() from public, anon;
revoke execute on function public.meta_desconectar() from public, anon;
revoke execute on function public.meta_verificar(uuid, text) from public;
revoke execute on function public.meta_receber(uuid, text, text) from public;
grant execute on function public.meta_salvar(text, text, text, text, text, text) to authenticated;
grant execute on function public.meta_credenciais() to authenticated;
grant execute on function public.meta_desconectar() to authenticated;
-- O webhook chama sem login (é a Meta): a assinatura com a chave secreta é a garantia
grant execute on function public.meta_verificar(uuid, text) to anon, authenticated;
grant execute on function public.meta_receber(uuid, text, text) to anon, authenticated;
