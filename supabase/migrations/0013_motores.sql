-- Motor WhatsApp XS ligado à conta pela internet (ponte na VPS), sem o navegador chamar 127.0.0.1.
-- O motor gera a chave e abre /motor/conectar#chave; o site guarda aqui e usa nas chamadas à ponte.
-- Um motor por conta: ligar outro computador troca a chave.

create table if not exists public.motores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  chave text not null check (chave ~ '^[A-Za-z0-9_-]{32,64}$'),
  computador text,
  ligado_em timestamptz not null default now()
);

alter table public.motores enable row level security;

create policy "dono le motor" on public.motores for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono liga motor" on public.motores for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono troca motor" on public.motores for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "dono desliga motor" on public.motores for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.motores from anon;
grant select, insert, update, delete on public.motores to authenticated;
