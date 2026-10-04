-- Plano pago: de quanto em quanto tempo (ciclo) e até quando vale (plano_ate).
-- Só valem para plano = 'ativo'; teste usa teste_ate e vitalício não acaba.
-- Quando plano_ate passa, a conta fica bloqueada até renovar.
--
-- Ex.: liberar um mês para alguém
--   update public.profiles
--   set plano = 'ativo', ciclo = 'mensal', plano_ate = now() + interval '1 month'
--   where email = 'cliente@exemplo.com';

alter table public.profiles add column if not exists ciclo text
  check (ciclo in ('diario', 'semanal', 'mensal', 'trimestral'));
alter table public.profiles add column if not exists plano_ate timestamptz;
