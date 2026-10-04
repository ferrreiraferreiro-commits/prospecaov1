-- Entrar com usuário: o banco só devolve o e-mail da conta para quem acertou a senha.
-- Antes, email_para_login(u) entregava o e-mail de qualquer usuário a qualquer um, sem senha.
-- Depois de 10 senhas erradas em 15 minutos o usuário trava por 15 minutos (o e-mail continua entrando
-- normalmente pelo Auth, que tem o próprio limite).
-- A versão antiga, sem senha, sai em 0015 (depois que o site novo estiver no ar).

create table if not exists public.tentativas_login (
  usuario text not null,
  em timestamptz not null default now()
);
create index if not exists tentativas_login_idx on public.tentativas_login (usuario, em);
create index if not exists tentativas_login_em_idx on public.tentativas_login (em);

-- Ninguém lê nem escreve direto: só a função abaixo
alter table public.tentativas_login enable row level security;
revoke all on public.tentativas_login from anon, authenticated;

create or replace function public.email_para_login(u text, senha text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := lower(trim(u));
  conta_email text;
  hash text;
begin
  if not public._usuario_ok(v) or coalesce(senha, '') = '' then
    return null;
  end if;
  -- Trava por usuário e uma trava geral contra robôs testando muitos usuários
  if (select count(*) from public.tentativas_login t where t.usuario = v and t.em > now() - interval '15 minutes') >= 10
     or (select count(*) from public.tentativas_login t where t.em > now() - interval '1 minute') >= 300 then
    raise exception 'Muitas tentativas agora. Espere alguns minutos e tente de novo.' using errcode = 'P0001';
  end if;

  select au.email, au.encrypted_password into conta_email, hash
  from public.profiles p
  join auth.users au on au.id = p.user_id
  where p.usuario = v
  limit 1;

  -- Contas antigas guardam a senha com o sufixo fixo do login por usuário
  if hash is not null and hash <> ''
     and (extensions.crypt(senha, hash) = hash or extensions.crypt(senha || '::central-prospeccao', hash) = hash) then
    delete from public.tentativas_login t where t.usuario = v;
    return conta_email;
  end if;

  insert into public.tentativas_login (usuario) values (v);
  delete from public.tentativas_login t where t.em < now() - interval '1 day';
  return null;
end;
$$;

revoke execute on function public.email_para_login(text, text) from public;
grant execute on function public.email_para_login(text, text) to anon, authenticated;

-- Esqueci a senha com usuário: o banco só diz se é uma conta antiga sem e-mail (aí a senha nova
-- vem pelo dono da XS). Para as outras, a pessoa digita o e-mail; o e-mail nunca sai daqui.
create or replace function public.usuario_sem_email(u text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select au.email like '%@prospeccao.local'
    from public.profiles p
    join auth.users au on au.id = p.user_id
    where p.usuario = lower(trim(u))
    limit 1
  ), false);
$$;

revoke execute on function public.usuario_sem_email(text) from public;
grant execute on function public.usuario_sem_email(text) to anon, authenticated;
