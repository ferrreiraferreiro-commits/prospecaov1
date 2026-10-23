-- © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
--
-- Conector da XS no Claude (MCP): o Claude Code (e depois o Claude) lê o CRM do dono com uma chave pessoal.
-- A chave é gerada no app e mostrada uma vez; aqui fica só o hash. Só o dono (profiles.admin) cria chaves.
-- O servidor do conector (na VPS) chama public.xs_conector com a chave e a chave anônima pública: a função
-- confere a chave e devolve só os dados de quem é dono dela.

create table if not exists public.chaves_api (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null default 'Claude Code',
  -- sha256 (hex) da chave; a chave nunca fica no banco
  hash text not null unique,
  -- últimos caracteres, para reconhecer na lista
  final text not null,
  criada_em timestamptz not null default now(),
  usada_em timestamptz,
  revogada_em timestamptz
);

alter table public.chaves_api enable row level security;

drop policy if exists "dono lê" on public.chaves_api;
create policy "dono lê" on public.chaves_api for select using ((select auth.uid()) = user_id);
drop policy if exists "dono cria (admin)" on public.chaves_api;
create policy "dono cria (admin)" on public.chaves_api for insert with check ((select auth.uid()) = user_id and public.sou_admin());
drop policy if exists "dono revoga" on public.chaves_api;
create policy "dono revoga" on public.chaves_api for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "dono apaga" on public.chaves_api;
create policy "dono apaga" on public.chaves_api for delete using ((select auth.uid()) = user_id);

create index if not exists chaves_api_user_idx on public.chaves_api (user_id);

-- Financeiro de um mês, com a mesma conta do app (src/lib/biz.ts → summarize)
create or replace function public.xs_conector_financeiro(p_user uuid, p_mes text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with t as (select * from public.transactions where user_id = p_user and to_char(data, 'YYYY-MM') = p_mes),
  r as (
    select
      coalesce(sum(valor) filter (where status = 'pago' and tipo = 'receita'), 0) as receitas,
      coalesce(sum(valor) filter (where status = 'pago' and tipo = 'despesa'), 0) as despesas,
      coalesce(sum(valor) filter (where status <> 'pago' and tipo = 'despesa'), 0) as a_pagar,
      coalesce(sum(valor) filter (where status = 'pendente' and tipo = 'receita' and payment_id is null), 0) as receitas_pendentes
    from t
  )
  select jsonb_build_object(
    'mes', p_mes,
    'receitas', r.receitas,
    'despesas', r.despesas,
    'saldo', r.receitas - r.despesas,
    'aPagar', r.a_pagar,
    'aReceber', r.receitas_pendentes + coalesce((
      select sum(p.valor) from public.client_payments p
       where p.user_id = p_user and p.status = 'pendente' and (p.vencimento is null or to_char(p.vencimento, 'YYYY-MM') <= p_mes)
    ), 0)
  )
  from r;
$$;

revoke all on function public.xs_conector_financeiro(uuid, text) from public, anon, authenticated;

create or replace function public.xs_conector(p_chave text, p_acao text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_chave uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes text;
  v_busca text;
  v_status text;
  v_lim int;
  v_lead public.leads%rowtype;
  v_ref text;
  v_texto text;
  v_data date;
begin
  if p_chave is null or length(p_chave) < 30 then
    raise exception 'Chave inválida.' using errcode = '28000';
  end if;
  select c.id, c.user_id into v_chave, v_user
    from public.chaves_api c
    join public.profiles p on p.user_id = c.user_id and p.admin
   where c.hash = encode(extensions.digest(p_chave, 'sha256'), 'hex')
     and c.revogada_em is null;
  if v_user is null then
    raise exception 'Chave inválida.' using errcode = '28000';
  end if;
  update public.chaves_api set usada_em = now()
   where id = v_chave and (usada_em is null or usada_em < now() - interval '5 minutes');

  p_args := coalesce(p_args, '{}'::jsonb);
  v_busca := nullif(trim(coalesce(p_args ->> 'busca', '')), '');
  v_status := nullif(trim(coalesce(p_args ->> 'status', '')), '');
  v_lim := least(100, greatest(1, coalesce(nullif(p_args ->> 'limite', '')::int, 20)));

  -- Lead pelo id ou pelo nome da empresa (para ler, anotar e agendar)
  if p_acao in ('lead', 'anotar', 'agendar_retorno') then
    v_ref := trim(coalesce(p_args ->> 'lead', ''));
    if v_ref = '' then
      raise exception 'Diga qual lead (id ou nome da empresa).' using errcode = 'P0002';
    end if;
    select l.* into v_lead from public.leads l
     where l.user_id = v_user
       and (l.id::text = v_ref or l.empresa ilike v_ref or l.empresa ilike '%' || v_ref || '%')
     order by (l.id::text = v_ref) desc, (l.empresa ilike v_ref) desc, l.updated_at desc
     limit 1;
    if v_lead.id is null then
      raise exception 'Não achei lead com "%".', v_ref using errcode = 'P0002';
    end if;
  end if;

  if p_acao = 'validar' then
    return jsonb_build_object('ok', true);

  elsif p_acao = 'resumo' then
    v_mes := to_char(v_hoje, 'YYYY-MM');
    return jsonb_build_object(
      'hoje', v_hoje,
      'totalLeads', (select count(*) from public.leads l where l.user_id = v_user),
      'leadsPorStatus', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) from (select l.status, count(*) as n from public.leads l where l.user_id = v_user group by l.status) s),
      'retornosHoje', (select coalesce(jsonb_agg(l.empresa || coalesce(' às ' || f.horario, '')), '[]'::jsonb) from public.followups f join public.leads l on l.id = f.lead_id where f.user_id = v_user and not f.concluido and f.data = v_hoje),
      'retornosAtrasados', (select coalesce(jsonb_agg(l.empresa || ' (' || f.data || ')'), '[]'::jsonb) from public.followups f join public.leads l on l.id = f.lead_id where f.user_id = v_user and not f.concluido and f.data < v_hoje),
      'proximasReunioes', (select coalesce(jsonb_agg(r.x), '[]'::jsonb) from (select m.data || coalesce(' ' || m.horario, '') || ': ' || l.empresa as x from public.meetings m join public.leads l on l.id = m.lead_id where m.user_id = v_user and m.data >= v_hoje and m.resultado is null order by m.data limit 10) r),
      'clientesAtivos', (select count(*) from public.clients c where c.user_id = v_user and not c.arquivado),
      'mensalidades', (select coalesce(sum(c.valor_mensal), 0) from public.clients c where c.user_id = v_user and not c.arquivado and c.tipo = 'fixo'),
      'projetosAbertos', (select count(*) from public.projects pr where pr.user_id = v_user and pr.status not in ('concluido', 'cancelado')),
      'financeiroDoMes', public.xs_conector_financeiro(v_user, v_mes)
    );

  elsif p_acao = 'leads' then
    return (
      with achados as (
        select l.* from public.leads l
         where l.user_id = v_user
           and (v_busca is null or l.empresa ilike '%' || v_busca || '%' or l.cidade ilike '%' || v_busca || '%' or l.nicho ilike '%' || v_busca || '%'
                or l.telefone ilike '%' || v_busca || '%' or l.whatsapp ilike '%' || v_busca || '%')
           and (v_status is null or l.status = v_status)
      )
      select jsonb_build_object(
        'total', (select count(*) from achados),
        'leads', coalesce((select jsonb_agg(jsonb_build_object(
            'id', a.id, 'empresa', a.empresa, 'nicho', a.nicho, 'cidade', a.cidade, 'estado', a.estado,
            'telefone', coalesce(a.whatsapp, a.telefone), 'instagram', a.instagram, 'site', a.website,
            'status', a.status, 'status2', a.status2, 'ultimaLigacao', a.ultima_ligacao, 'proximaAcao', a.proxima_acao))
          from (select * from achados order by updated_at desc limit v_lim) a), '[]'::jsonb)
      )
    );

  elsif p_acao = 'lead' then
    return to_jsonb(v_lead) - 'user_id' - 'import_id' || jsonb_build_object(
      'historico', (select coalesce(jsonb_agg(h.x), '[]'::jsonb) from (
        select to_char(i.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') || ' ' || i.tipo || coalesce(' (' || i.status || ')', '') || ': ' || coalesce(i.observacao, '') as x
          from public.interactions i where i.lead_id = v_lead.id and i.user_id = v_user order by i.created_at desc limit 20) h),
      'retornos', (select coalesce(jsonb_agg(f.data || coalesce(' ' || f.horario, '') || coalesce(' — ' || f.observacao, '')), '[]'::jsonb)
          from public.followups f where f.lead_id = v_lead.id and f.user_id = v_user and not f.concluido),
      'reunioes', (select coalesce(jsonb_agg(m.data || coalesce(' ' || m.horario, '') || ' ' || coalesce(m.resultado, 'sem resultado')), '[]'::jsonb)
          from public.meetings m where m.lead_id = v_lead.id and m.user_id = v_user)
    );

  elsif p_acao = 'clientes' then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome', c.nome, 'empresa', c.empresa, 'tipo', c.tipo, 'valorMensal', c.valor_mensal, 'segmento', c.segmento,
        'telefone', c.telefone, 'site', c.website,
        'pendente', coalesce((select sum(p.valor) from public.client_payments p where p.client_id = c.id and p.user_id = v_user and p.status = 'pendente'), 0)
      ) order by c.nome)
      from public.clients c where c.user_id = v_user and not c.arquivado
    ), '[]'::jsonb);

  elsif p_acao = 'projetos' then
    return jsonb_build_object(
      'abertos', coalesce((
        select jsonb_agg(jsonb_build_object(
          'nome', pr.nome, 'cliente', (select c.nome from public.clients c where c.id = pr.client_id), 'status', pr.status,
          'prioridade', pr.prioridade, 'prazo', pr.prazo, 'orcamento', pr.orcamento,
          'tarefasAbertas', coalesce((select jsonb_agg(t ->> 'texto') from jsonb_array_elements(coalesce(pr.tarefas, '[]'::jsonb)) t where not coalesce((t ->> 'feito')::boolean, false)), '[]'::jsonb)
        ) order by pr.prazo nulls last)
        from public.projects pr where pr.user_id = v_user and pr.status not in ('concluido', 'cancelado')
      ), '[]'::jsonb),
      'concluidos', (select count(*) from public.projects pr where pr.user_id = v_user and pr.status = 'concluido')
    );

  elsif p_acao = 'financeiro' then
    v_mes := coalesce(nullif(p_args ->> 'mes', ''), to_char(v_hoje, 'YYYY-MM'));
    if v_mes !~ '^\d{4}-\d{2}$' then
      raise exception 'Mês precisa ser AAAA-MM.' using errcode = '22023';
    end if;
    return public.xs_conector_financeiro(v_user, v_mes) || jsonb_build_object(
      'lancamentos', coalesce((select jsonb_agg(x.l) from (
        select t.data || ' ' || t.tipo || ' ' || t.status || ': ' || t.descricao || ' R$ ' || t.valor || ' (' || t.categoria || ')' as l
          from public.transactions t where t.user_id = v_user and to_char(t.data, 'YYYY-MM') = v_mes order by t.data desc limit 30) x), '[]'::jsonb)
    );

  elsif p_acao = 'anotar' then
    v_texto := trim(coalesce(p_args ->> 'texto', ''));
    if v_texto = '' then
      raise exception 'Anotação vazia.' using errcode = '22023';
    end if;
    insert into public.interactions (user_id, lead_id, tipo, status, observacao)
    values (v_user, v_lead.id, 'nota', null, left('Claude: ' || v_texto, 4000));
    return jsonb_build_object('ok', true, 'lead', v_lead.empresa);

  elsif p_acao = 'agendar_retorno' then
    begin
      v_data := (p_args ->> 'data')::date;
    exception when others then
      raise exception 'Data precisa ser AAAA-MM-DD.' using errcode = '22023';
    end;
    if v_data is null then
      raise exception 'Data precisa ser AAAA-MM-DD.' using errcode = '22023';
    end if;
    insert into public.followups (user_id, lead_id, data, horario, periodo, observacao, concluido)
    values (
      v_user, v_lead.id, v_data,
      case when (p_args ->> 'horario') ~ '^\d{2}:\d{2}$' then p_args ->> 'horario' end,
      null,
      nullif(left(trim(coalesce(p_args ->> 'observacao', '')), 1000), ''),
      false
    );
    return jsonb_build_object('ok', true, 'lead', v_lead.empresa, 'data', v_data);
  end if;

  raise exception 'Ação desconhecida.' using errcode = '22023';
end;
$$;

revoke all on function public.xs_conector(text, text, jsonb) from public;
grant execute on function public.xs_conector(text, text, jsonb) to anon, authenticated;
