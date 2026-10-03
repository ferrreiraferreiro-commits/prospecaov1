-- O nome digitado no cadastro (metadados do usuário) já entra no perfil.
create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, nome)
  values (new.id, new.email, nullif(trim(new.raw_user_meta_data ->> 'nome'), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.criar_perfil() from public, anon, authenticated;
