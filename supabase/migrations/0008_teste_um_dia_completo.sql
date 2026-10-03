-- Teste grátis: 1 dia com tudo liberado (inclusive o Motor XS), em vez de 14 dias sem ele.
alter table public.profiles alter column teste_ate set default (now() + interval '1 day');
alter table public.profiles alter column recursos set default array['motor'];

-- Contas que já estão no teste passam para a regra nova
update public.profiles
set recursos = array(select distinct unnest(recursos || array['motor'])),
    teste_ate = created_at + interval '1 day'
where plano = 'teste';
