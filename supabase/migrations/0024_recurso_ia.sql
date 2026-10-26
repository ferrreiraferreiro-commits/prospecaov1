-- Recurso "ia" (IA no WhatsApp): só o dono da XS libera ou tira, conta por conta, na tela Contas.
-- Fica em profiles.recursos, como o 'motor'. Os usuários não conseguem mudar recursos (sem grant de update).

-- Quem tem a IA liberada (para a tela Contas)
create or replace function public.admin_contas_ia()
returns table (user_id uuid, ia boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    raise exception 'Só o dono da XS vê as contas.' using errcode = '42501';
  end if;
  return query select p.user_id, 'ia' = any(p.recursos) from public.profiles p;
end;
$$;

-- Liga ou desliga a IA de uma conta
create or replace function public.admin_definir_ia(alvo uuid, ligar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    raise exception 'Só o dono da XS pode liberar a IA.' using errcode = '42501';
  end if;
  update public.profiles
  set recursos = case
        when ligar then (select array_agg(distinct r) from unnest(array_append(recursos, 'ia')) r)
        else array_remove(recursos, 'ia')
      end,
      updated_at = now()
  where user_id = alvo;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
end;
$$;

revoke execute on function public.admin_contas_ia() from public, anon;
revoke execute on function public.admin_definir_ia(uuid, boolean) from public, anon;
grant execute on function public.admin_contas_ia() to authenticated;
grant execute on function public.admin_definir_ia(uuid, boolean) to authenticated;

-- O dono da XS já começa com a IA
update public.profiles set recursos = array_append(recursos, 'ia') where admin and not ('ia' = any(recursos));
