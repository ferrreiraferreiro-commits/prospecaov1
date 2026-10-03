-- XS Prospecção — gestão (módulos reconstruídos do Caldeira Nexus):
-- clientes, pagamentos, anotações, projetos, financeiro, precificação e funis.
-- Só cria tabelas/colunas novas; nada existente é alterado.

alter table public.settings add column if not exists precificacao jsonb;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  empresa text,
  telefone text,
  email text,
  documento text,
  segmento text,
  origem text,
  endereco text,
  website text,
  tipo text not null default 'avulso', -- fixo | avulso
  valor_mensal numeric(12, 2),
  tags jsonb not null default '[]'::jsonb,
  arquivado boolean not null default false,
  lead_id uuid references public.leads (id) on delete set null,
  observacoes text,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  descricao text,
  client_id uuid references public.clients (id) on delete set null,
  status text not null default 'planejamento', -- planejamento | em_andamento | revisao | concluido | cancelado
  prioridade text not null default 'media', -- baixa | media | alta | urgente
  orcamento numeric(12, 2) not null default 0,
  prazo date,
  tarefas jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  descricao text not null default '',
  valor numeric(12, 2) not null default 0,
  status text not null default 'pendente', -- pago | pendente
  metodo text not null default 'Pix',
  vencimento date,
  pago_em timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  texto text not null,
  tipo text not null default 'anotacao', -- anotacao | lembrete
  vencimento date,
  concluido boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  descricao text not null,
  valor numeric(12, 2) not null default 0,
  tipo text not null, -- receita | despesa
  categoria text not null default 'Outros',
  data date not null default current_date,
  status text not null default 'pago', -- pago | pendente
  payment_id uuid references public.client_payments (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  cliente text,
  horas numeric(10, 2) not null default 0,
  custos_diretos numeric(12, 2) not null default 0,
  imposto numeric(6, 2) not null default 0,
  taxa_cartao numeric(6, 2) not null default 0,
  margem numeric(6, 2) not null default 0,
  preco_final numeric(12, 2) not null default 0,
  valor_hora numeric(12, 2) not null default 0,
  lucro numeric(12, 2) not null default 0,
  observacoes text,
  created_at timestamptz not null default now()
);

create table if not exists public.funnels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  etapas jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_user_idx on public.clients (user_id, created_at);
create index if not exists clients_lead_idx on public.clients (lead_id);
create index if not exists projects_user_idx on public.projects (user_id, created_at);
create index if not exists projects_client_idx on public.projects (client_id);
create index if not exists client_payments_user_idx on public.client_payments (user_id, created_at);
create index if not exists client_payments_client_idx on public.client_payments (client_id);
create index if not exists client_payments_project_idx on public.client_payments (project_id);
create index if not exists client_notes_client_idx on public.client_notes (client_id);
create index if not exists client_notes_user_idx on public.client_notes (user_id, created_at);
create index if not exists transactions_user_idx on public.transactions (user_id, created_at);
create index if not exists transactions_payment_idx on public.transactions (payment_id);
create index if not exists transactions_client_idx on public.transactions (client_id);
create index if not exists pricing_estimates_user_idx on public.pricing_estimates (user_id, created_at);
create index if not exists funnels_user_idx on public.funnels (user_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['clients', 'projects', 'client_payments', 'client_notes', 'transactions', 'pricing_estimates', 'funnels'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format(
      'create policy "dono" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end $$;
