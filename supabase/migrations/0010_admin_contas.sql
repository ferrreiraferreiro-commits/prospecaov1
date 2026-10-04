-- Tela "Contas": o dono da XS vê todas as contas e muda o plano de cada uma pelo app.
-- Ninguém lê nem altera a conta dos outros direto na tabela: só por estas funções,
-- e elas recusam quem não tem profiles.admin = true (coluna que o usuário não consegue mudar).

alter table public.profiles add column if not exists admin boolean not null default false;

create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.admin from public.profiles p where p.user_id = (select auth.uid())), false);
$$;

create or replace function public.admin_contas()
returns table (
  user_id uuid,
  email text,
  nome text,
  cidade text,
  plano text,
  ciclo text,
  teste_ate timestamptz,
  plano_ate timestamptz,
  admin boolean,
  created_at timestamptz,
  ultimo_acesso timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    raise exception 'Só o dono da XS pode ver as contas.' using errcode = '42501';
  end if;
  return query
    select p.user_id, p.email, p.nome, p.cidade, p.plano, p.ciclo, p.teste_ate, p.plano_ate, p.admin, p.created_at, u.last_sign_in_at
    from public.profiles p
    left join auth.users u on u.id = p.user_id
    order by p.created_at desc;
end;
$$;

-- novo_plano: teste | ativo | vitalicio | cancelado. `ate` = fim do teste ou do plano ativo.
create or replace function public.admin_definir_plano(alvo uuid, novo_plano text, novo_ciclo text, ate timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    raise exception 'Só o dono da XS pode mudar planos.' using errcode = '42501';
  end if;
  if novo_plano not in ('teste', 'ativo', 'vitalicio', 'cancelado') then
    raise exception 'Plano inválido.';
  end if;
  if novo_plano = 'teste' and ate is null then
    raise exception 'Escolha até quando vai o teste.';
  end if;
  if alvo = (select auth.uid()) and novo_plano = 'cancelado' then
    raise exception 'Você não pode pausar a sua própria conta.';
  end if;
  update public.profiles
  set plano = novo_plano,
      ciclo = case when novo_plano = 'ativo' then novo_ciclo end,
      plano_ate = case when novo_plano = 'ativo' then ate end,
      teste_ate = case when novo_plano = 'teste' then ate else teste_ate end,
      updated_at = now()
  where user_id = alvo;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
end;
$$;

revoke execute on function public.sou_admin() from public, anon;
revoke execute on function public.admin_contas() from public, anon;
revoke execute on function public.admin_definir_plano(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.sou_admin() to authenticated;
grant execute on function public.admin_contas() to authenticated;
grant execute on function public.admin_definir_plano(uuid, text, text, timestamptz) to authenticated;

-- O dono da XS (login "gabriel")
update public.profiles set admin = true where email = 'gabriel@prospeccao.local';
