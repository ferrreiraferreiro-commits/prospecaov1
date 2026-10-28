-- © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados.
-- Plano Times: desenvolvedor não fica com leads (só recebe sites para fazer), e o site pode ir direto para um desenvolvedor.

create or replace function public.leads_responsavel_nao_dev()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.responsavel is not null
     and exists (select 1 from public.equipe_membros m where m.membro = new.responsavel and m.papel = 'desenvolvedor') then
    raise exception 'Desenvolvedor não recebe leads. Mande o lead para fazer o site.';
  end if;
  return new;
end;
$$;
drop trigger if exists leads_responsavel_nao_dev on public.leads;
create trigger leads_responsavel_nao_dev before insert or update of responsavel on public.leads
  for each row execute function public.leads_responsavel_nao_dev();

-- Aviso no chat: também quando o site já vai direto para um desenvolvedor
create or replace function public.sites_aviso_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa text := coalesce((select l.empresa from public.leads l where l.id = new.lead_id), 'um lead');
  v_quem text;
  v_dev text := (select coalesce(p.nome, p.usuario) from public.profiles p where p.user_id = coalesce(new.dev, old.dev));
  v_texto text;
begin
  if tg_op = 'INSERT' or (new.pedido_em is distinct from old.pedido_em) then
    v_quem := coalesce((select coalesce(p.nome, p.usuario) from public.profiles p where p.user_id = new.pedido_por), 'Alguém');
    v_texto := case
      when new.dev is not null then format('%s mandou o site de %s direto para %s.', v_quem, v_empresa, coalesce(v_dev, 'um desenvolvedor'))
      else format('%s mandou o site de %s para a fila.', v_quem, v_empresa)
    end;
  elsif new.status is distinct from old.status or new.dev is distinct from old.dev then
    v_texto := case
      when new.status = 'pronto' then format('%s terminou o site de %s.', coalesce(v_dev, 'Alguém'), v_empresa)
      when new.status = 'fazendo' and new.dev is not null then format('%s pegou o site de %s.', coalesce(v_dev, 'Alguém'), v_empresa)
      when new.status = 'fila' and old.dev is not null then format('%s devolveu o site de %s para a fila.', coalesce(v_dev, 'Alguém'), v_empresa)
    end;
  end if;
  if v_texto is not null then
    insert into public.equipe_chat (conta, autor, texto, lead_id) values (new.conta, null, v_texto, new.lead_id);
  end if;
  return new;
end;
$$;
