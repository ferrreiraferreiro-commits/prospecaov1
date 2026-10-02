-- Central de Prospecção — schema inicial
-- Cada linha pertence ao usuário logado (user_id = auth.uid()), protegida por RLS.

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  arquivo text not null,
  quantidade_leads integer not null default 0,
  data_importacao timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- dados importados (não alterados pelo sistema)
  empresa text not null,
  nicho text,
  telefone text,
  whatsapp text,
  instagram text,
  website text,
  endereco text,
  cidade text,
  estado text,
  avaliacao numeric(2, 1),
  numero_avaliacoes integer,
  pasta text,
  etapa text,
  maps_url text,
  observacoes text,
  dados_extras jsonb,
  import_id uuid references public.imports (id) on delete set null,
  -- trabalho de prospecção
  status text not null default 'novo',
  falei_com text,
  cargo text,
  anotacoes text,
  proxima_acao text,
  ultima_ligacao timestamptz,
  duplicado_ignorado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  tipo text not null, -- ligacao | status | followup | reuniao | nota | importacao
  status text,
  falei_com text,
  cargo text,
  observacao text,
  created_at timestamptz not null default now()
);

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  data date not null,
  horario text, -- HH:mm
  periodo text, -- manha | tarde | noite
  observacao text,
  concluido boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  data date not null,
  horario text,
  contato text,
  observacao text,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  meta_diaria integer not null default 50,
  nome_vendedor text not null default '',
  servico text not null default 'desenvolvimento de sites',
  roteiro jsonb,
  objecoes jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists leads_user_idx on public.leads (user_id, created_at);
create index if not exists interactions_lead_idx on public.interactions (lead_id, created_at);
create index if not exists interactions_user_idx on public.interactions (user_id, created_at);
create index if not exists followups_user_idx on public.followups (user_id, concluido, data);
create index if not exists followups_lead_idx on public.followups (lead_id);
create index if not exists meetings_user_idx on public.meetings (user_id, data);
create index if not exists meetings_lead_idx on public.meetings (lead_id);
create index if not exists leads_import_idx on public.leads (import_id);

-- updated_at automático
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- Row Level Security: cada usuário só enxerga os próprios dados
alter table public.imports enable row level security;
alter table public.leads enable row level security;
alter table public.interactions enable row level security;
alter table public.followups enable row level security;
alter table public.meetings enable row level security;
alter table public.settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['imports', 'leads', 'interactions', 'followups', 'meetings', 'settings'] loop
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format(
      'create policy "dono" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end $$;
