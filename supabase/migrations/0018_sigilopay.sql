-- Venda do plano Mensal pela SigiloPay: pagou → a conta vira "ativo / mensal" sozinha.
--
-- Caminho do aviso: SigiloPay (webhook) → /api/sigilopay na Vercel → sigilopay_receber(dados).
-- O token que a SigiloPay manda em cada aviso é conferido com o que o dono salvou na tela Contas.
-- Qual conta: o parâmetro ?xs=<user_id> que a XS põe no link do checkout (volta no checkoutUrl);
-- sem ele, o e-mail da compra. Sem conta com esse e-mail, o pagamento fica guardado e é
-- aplicado sozinho quando alguém cria a conta (ou cadastra o e-mail) com esse e-mail.
-- Só acrescenta coisas: apps antigos continuam funcionando.

-- ---------------------------------------------------------------------------
-- Link do checkout e preço mostrado nas telas (todos leem; o dono edita)
-- ---------------------------------------------------------------------------
alter table public.xs_config add column if not exists checkout_mensal text;
alter table public.xs_config add column if not exists preco_mensal numeric(10, 2);

alter table public.xs_config drop constraint if exists xs_config_checkout_https;
alter table public.xs_config add constraint xs_config_checkout_https check (checkout_mensal is null or checkout_mensal ~ '^https://');
alter table public.xs_config drop constraint if exists xs_config_preco_positivo;
alter table public.xs_config add constraint xs_config_preco_positivo check (preco_mensal is null or preco_mensal > 0);

grant update (checkout_mensal, preco_mensal) on public.xs_config to authenticated;

-- ---------------------------------------------------------------------------
-- Token do webhook: ninguém lê pela API (nem o dono), só as funções abaixo
-- ---------------------------------------------------------------------------
create table if not exists public.xs_segredos (
  id int primary key default 1 check (id = 1),
  sigilopay_token text,
  updated_at timestamptz not null default now()
);
insert into public.xs_segredos (id) values (1) on conflict (id) do nothing;
alter table public.xs_segredos enable row level security;
revoke all on public.xs_segredos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Avisos recebidos (um por transação e evento: aviso repetido não conta duas vezes)
-- ---------------------------------------------------------------------------
create table if not exists public.sigilopay_eventos (
  id uuid primary key default gen_random_uuid(),
  transacao_id text not null,
  evento text not null,
  email text,
  nome text,
  valor numeric(10, 2),
  pago_em timestamptz,
  user_id uuid references public.profiles (user_id) on delete set null,
  -- aplicado | sem_conta | sem_mudanca | estornado
  situacao text not null,
  recebido_em timestamptz not null default now(),
  dados jsonb not null,
  unique (transacao_id, evento)
);
create index if not exists sigilopay_eventos_email_idx on public.sigilopay_eventos (email) where situacao = 'sem_conta';

alter table public.sigilopay_eventos enable row level security;
drop policy if exists "só o dono lê" on public.sigilopay_eventos;
create policy "só o dono lê" on public.sigilopay_eventos for select to authenticated using ((select public.sou_admin()));
revoke all on public.sigilopay_eventos from anon, authenticated;
grant select on public.sigilopay_eventos to authenticated;

-- ---------------------------------------------------------------------------
-- Aplica um pagamento a uma conta: +1 mês (a partir do fim atual, se ainda está em dia)
-- ---------------------------------------------------------------------------
create or replace function public._sigilopay_aplicar(ev_id uuid, conta uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.sigilopay_eventos;
  p public.profiles;
begin
  select * into e from public.sigilopay_eventos where id = ev_id;
  select * into p from public.profiles where user_id = conta;
  if e.id is null or p.user_id is null then
    return 'sem_conta';
  end if;

  -- Vitalício e o dono não mudam de plano; o pagamento só fica anotado
  if p.plano = 'vitalicio' or p.admin then
    update public.sigilopay_eventos set user_id = conta, situacao = 'sem_mudanca' where id = ev_id;
  else
    update public.profiles
    set plano = 'ativo',
        ciclo = 'mensal',
        -- 2 dias de folga na primeira vez: a cobrança do mês seguinte cai antes de vencer
        plano_ate = case
          when p.plano = 'ativo' and p.plano_ate > now() then p.plano_ate + interval '1 month'
          else now() + interval '1 month 2 days'
        end,
        updated_at = now()
    where user_id = conta;
    update public.sigilopay_eventos set user_id = conta, situacao = 'aplicado' where id = ev_id;
  end if;

  insert into public.pagamentos_xs (user_id, valor, plano, pago_em, obs)
  values (conta, coalesce(e.valor, 0), 'mensal', coalesce(e.pago_em, now()), 'SigiloPay · ' || e.transacao_id);
  return 'aplicado';
end;
$$;

revoke execute on function public._sigilopay_aplicar(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recebe um aviso da SigiloPay (chamado pela /api/sigilopay com a chave pública)
-- ---------------------------------------------------------------------------
create or replace function public.sigilopay_receber(dados jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  segredo text;
  v_evento text := dados ->> 'event';
  v_tx jsonb := coalesce(dados -> 'transaction', '{}'::jsonb);
  v_tx_id text := v_tx ->> 'id';
  v_email text := nullif(lower(trim(dados #>> '{client,email}')), '');
  v_ref text;
  v_conta uuid;
  v_id uuid;
  v_pago timestamptz;
  v_original public.sigilopay_eventos;
begin
  select s.sigilopay_token into segredo from public.xs_segredos s where s.id = 1;
  if segredo is null or coalesce(dados ->> 'token', '') <> segredo then
    raise exception 'Token da SigiloPay não confere.' using errcode = '28000';
  end if;

  if v_evento not in ('TRANSACTION_PAID', 'TRANSACTION_REFUNDED', 'TRANSACTION_CHARGED_BACK') or v_tx_id is null then
    return 'ignorado';
  end if;
  if exists (select 1 from public.sigilopay_eventos e where e.transacao_id = v_tx_id and e.evento = v_evento) then
    return 'repetido';
  end if;

  begin
    v_pago := (v_tx ->> 'payedAt')::timestamptz;
  exception when others then
    v_pago := null;
  end;

  -- Estorno ou contestação: tira o mês que aquele pagamento tinha dado
  if v_evento <> 'TRANSACTION_PAID' then
    select * into v_original from public.sigilopay_eventos e
    where e.transacao_id = v_tx_id and e.evento = 'TRANSACTION_PAID';
    insert into public.sigilopay_eventos (transacao_id, evento, email, nome, valor, pago_em, user_id, situacao, dados)
    values (v_tx_id, v_evento, v_email, dados #>> '{client,name}', (v_tx ->> 'amount')::numeric, v_pago, v_original.user_id, 'estornado', dados);
    if v_original.situacao = 'aplicado' and v_original.user_id is not null then
      update public.profiles
      set plano_ate = plano_ate - interval '1 month', updated_at = now()
      where user_id = v_original.user_id and plano = 'ativo' and plano_ate is not null;
      delete from public.pagamentos_xs where user_id = v_original.user_id and obs = 'SigiloPay · ' || v_tx_id;
    end if;
    update public.sigilopay_eventos set situacao = 'estornado' where transacao_id = v_tx_id and evento = 'TRANSACTION_PAID';
    return 'estornado';
  end if;

  -- Conta: primeiro o ?xs= do link do checkout, depois o e-mail da compra
  v_ref := substring(coalesce(dados ->> 'checkoutUrl', '') from '[?&]xs=([0-9a-fA-F-]{36})');
  if v_ref is not null then
    select p.user_id into v_conta from public.profiles p where p.user_id = v_ref::uuid;
  end if;
  if v_conta is null and v_email is not null then
    select p.user_id into v_conta from public.profiles p where lower(p.email) = v_email order by p.created_at limit 1;
  end if;

  insert into public.sigilopay_eventos (transacao_id, evento, email, nome, valor, pago_em, situacao, dados)
  values (v_tx_id, v_evento, v_email, dados #>> '{client,name}', (v_tx ->> 'amount')::numeric, v_pago, 'sem_conta', dados)
  returning id into v_id;

  if v_conta is null then
    return 'sem_conta';
  end if;
  return public._sigilopay_aplicar(v_id, v_conta);
end;
$$;

revoke execute on function public.sigilopay_receber(jsonb) from public, authenticated;
grant execute on function public.sigilopay_receber(jsonb) to anon;

-- ---------------------------------------------------------------------------
-- Comprou antes de ter conta: aplica quando a conta aparece com aquele e-mail
-- ---------------------------------------------------------------------------
create or replace function public._sigilopay_pendentes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev record;
begin
  if new.email is null or new.email like '%@prospeccao.local' then
    return new;
  end if;
  for ev in
    select e.id from public.sigilopay_eventos e
    where e.situacao = 'sem_conta' and e.evento = 'TRANSACTION_PAID' and e.email = lower(new.email)
    order by e.recebido_em
  loop
    perform public._sigilopay_aplicar(ev.id, new.user_id);
  end loop;
  return new;
end;
$$;

revoke execute on function public._sigilopay_pendentes() from public, anon, authenticated;

drop trigger if exists sigilopay_pendentes on public.profiles;
create trigger sigilopay_pendentes
after insert or update of email on public.profiles
for each row execute function public._sigilopay_pendentes();

-- ---------------------------------------------------------------------------
-- Tela Contas: o dono salva o token (não dá para ler de volta) e vê se já está salvo
-- ---------------------------------------------------------------------------
create or replace function public.admin_sigilopay_token(token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    raise exception 'Só o dono da XS pode mudar isso.' using errcode = '42501';
  end if;
  update public.xs_segredos
  set sigilopay_token = nullif(trim(token), ''), updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.admin_sigilopay_status()
returns table (token_salvo boolean, ultimo_aviso timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select s.sigilopay_token is not null from public.xs_segredos s where s.id = 1),
    (select max(e.recebido_em) from public.sigilopay_eventos e)
  where public.sou_admin();
$$;

revoke execute on function public.admin_sigilopay_token(text) from public, anon;
revoke execute on function public.admin_sigilopay_status() from public, anon;
grant execute on function public.admin_sigilopay_token(text) to authenticated;
grant execute on function public.admin_sigilopay_status() to authenticated;
