-- © 2026 Gabriel Yamashita Marcelino — XS Prospecção. Todos os direitos reservados. Uso sob a licença em LICENSE.
-- Chave do conector (Ajustes → Jarvis) para TODAS as contas, não só o dono.
-- Cada chave continua vendo só os dados da própria conta (xs_conector filtra tudo por v_user).
-- 'validar' agora diz se a chave é do dono: o Motor só entrega vendedor/Xico/disparos/sites ao dono;
-- as outras contas recebem só as ferramentas do CRM.
-- Reverter: reaplicar 0022_conector_jarvis.sql e a política "dono cria (admin)" da 0020.

drop policy if exists "dono cria (admin)" on public.chaves_api;
drop policy if exists "conta cria" on public.chaves_api;
create policy "conta cria" on public.chaves_api for insert with check ((select auth.uid()) = user_id);

do $$
declare
  d text := pg_get_functiondef('public.xs_conector(text,text,jsonb)'::regprocedure);
begin
  d := replace(d, 'join public.profiles p on p.user_id = c.user_id and p.admin',
                  'join public.profiles p on p.user_id = c.user_id');
  d := replace(d, $q$return jsonb_build_object('ok', true);$q$,
                  $q$return jsonb_build_object('ok', true, 'dono', coalesce((select pr.admin from public.profiles pr where pr.user_id = v_user), false));$q$);
  execute d;
end $$;
