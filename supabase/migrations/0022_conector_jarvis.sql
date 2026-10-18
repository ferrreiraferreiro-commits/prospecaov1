-- © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
-- Conector do Claude/Jarvis, versão 2: além do que já fazia (0020), agora
--   importar_leads  salva no CRM empresas achadas pela busca (sem repetir quem já está lá)
--   mudar_status    muda o status de um lead e registra no histórico
--   leads_ids       devolve leads pelo id (para montar um disparo)
-- Mesma checagem de chave (só admin, chave não revogada) e tudo sempre só do dono da chave.

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
  v_item jsonb;
  v_novo uuid;
  v_tel text;
  v_n int := 0;
  v_pulados int := 0;
  v_ids jsonb := '[]'::jsonb;
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
  if p_acao in ('lead', 'anotar', 'agendar_retorno', 'mudar_status') then
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

  -- Muda o status de um lead (e deixa registrado no histórico)
  elsif p_acao = 'mudar_status' then
    v_status := trim(coalesce(p_args ->> 'status', ''));
    if v_status not in ('novo', 'so_chama', 'nao_atendeu', 'nao_completou', 'numero_incorreto', 'falei_responsavel', 'pediu_whatsapp',
                        'follow_up', 'agendou_reuniao', 'nao_tem_interesse', 'cliente_potencial', 'finalizado') then
      raise exception 'Status inválido.' using errcode = '22023';
    end if;
    update public.leads set status = v_status where id = v_lead.id and user_id = v_user;
    insert into public.interactions (user_id, lead_id, tipo, status, observacao)
    values (v_user, v_lead.id, 'nota', v_status, 'Jarvis: status mudado para ' || v_status);
    return jsonb_build_object('ok', true, 'lead', v_lead.empresa, 'status', v_status);

  -- Salva no CRM empresas achadas pela busca (pula quem já está no CRM pelo telefone ou nome + cidade)
  elsif p_acao = 'importar_leads' then
    for v_item in select x from jsonb_array_elements(coalesce(p_args -> 'leads', '[]'::jsonb)) as x limit 200 loop
      v_texto := left(trim(coalesce(v_item ->> 'empresa', '')), 200);
      if v_texto = '' then
        continue;
      end if;
      v_tel := regexp_replace(coalesce(nullif(v_item ->> 'whatsapp', ''), v_item ->> 'telefone', ''), '\D', '', 'g');
      if exists (
        select 1 from public.leads l
         where l.user_id = v_user
           and ((length(v_tel) >= 10 and right(regexp_replace(coalesce(l.whatsapp, l.telefone, ''), '\D', '', 'g'), 10) = right(v_tel, 10))
                or (lower(l.empresa) = lower(v_texto) and lower(coalesce(l.cidade, '')) = lower(coalesce(v_item ->> 'cidade', ''))))
      ) then
        v_pulados := v_pulados + 1;
        continue;
      end if;
      insert into public.leads (user_id, empresa, nicho, telefone, whatsapp, instagram, website, endereco, cidade, estado, status, observacoes)
      values (
        v_user, v_texto, left(v_item ->> 'nicho', 120), left(v_item ->> 'telefone', 40), left(v_item ->> 'whatsapp', 40),
        nullif(left(v_item ->> 'instagram', 200), ''), nullif(left(v_item ->> 'website', 300), ''), left(v_item ->> 'endereco', 300),
        left(v_item ->> 'cidade', 120), upper(left(v_item ->> 'estado', 2)), 'novo', 'Encontrado pelo Jarvis (busca da XS)'
      )
      returning id into v_novo;
      v_ids := v_ids || to_jsonb(v_novo);
      v_n := v_n + 1;
    end loop;
    return jsonb_build_object('ok', true, 'salvos', v_n, 'jaExistiam', v_pulados, 'ids', v_ids);

  -- Leads por id (para montar um disparo com os que acabaram de ser salvos)
  elsif p_acao = 'leads_ids' then
    return jsonb_build_object('leads', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'empresa', l.empresa, 'telefone', coalesce(l.whatsapp, l.telefone), 'status', l.status))
        from public.leads l
       where l.user_id = v_user
         and l.id::text in (select jsonb_array_elements_text(coalesce(p_args -> 'ids', '[]'::jsonb)))
    ), '[]'::jsonb));
  end if;

  raise exception 'Ação desconhecida.' using errcode = '22023';
end;
$$;

revoke all on function public.xs_conector(text, text, jsonb) from public;
grant execute on function public.xs_conector(text, text, jsonb) to anon, authenticated;
