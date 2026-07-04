-- VortSpec M0 schema (PRD section 10)

-- Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  ai_mode text not null default 'bundled',
  created_at timestamptz not null default now()
);

-- AI keys per project (BYOK)
create table if not exists public.project_ai_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null,
  encrypted_key text not null,
  fingerprint text not null,
  created_at timestamptz not null default now()
);

-- Import sources
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('figma', 'zip')),
  storage_ref text,
  figma_file_key text,
  created_at timestamptz not null default now()
);

-- Import jobs
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  stage_states jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

-- Design tokens (JSONB doc = DesignToken from packages/ir)
create table if not exists public.tokens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  doc jsonb not null,
  deprecated boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Components (JSONB doc = ComponentIR from packages/ir)
create table if not exists public.components (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  doc jsonb not null,
  status text not null default 'imported',
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Patches (JSONB doc = IRPatch from packages/ir)
create table if not exists public.patches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  doc jsonb not null,
  status text not null default 'applied',
  base_version integer not null,
  created_at timestamptz not null default now()
);

-- LLM usage metering
create table if not exists public.llm_usage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null,
  model text not null,
  tokens_in integer not null,
  tokens_out integer not null,
  purpose text not null,
  created_at timestamptz not null default now()
);

-- Enable RLS on all tables
alter table public.projects enable row level security;
alter table public.project_ai_keys enable row level security;
alter table public.sources enable row level security;
alter table public.imports enable row level security;
alter table public.tokens enable row level security;
alter table public.components enable row level security;
alter table public.patches enable row level security;
alter table public.llm_usage enable row level security;

-- RLS Policies: projects owned by user
create policy "Users can view own projects" on public.projects
  for select using (owner_id = auth.uid());
create policy "Users can create projects" on public.projects
  for insert with check (owner_id = auth.uid());
create policy "Users can update own projects" on public.projects
  for update using (owner_id = auth.uid());
create policy "Users can delete own projects" on public.projects
  for delete using (owner_id = auth.uid());

-- RLS: child tables follow project ownership
create policy "Project-scoped select" on public.sources
  for select using (project_id in (select id from public.projects where owner_id = auth.uid()));
create policy "Project-scoped insert" on public.sources
  for insert with check (project_id in (select id from public.projects where owner_id = auth.uid()));

create policy "Project-scoped select" on public.imports
  for select using (project_id in (select id from public.projects where owner_id = auth.uid()));
create policy "Project-scoped insert" on public.imports
  for insert with check (project_id in (select id from public.projects where owner_id = auth.uid()));
create policy "Project-scoped update" on public.imports
  for update using (project_id in (select id from public.projects where owner_id = auth.uid()));

create policy "Project-scoped select" on public.tokens
  for select using (project_id in (select id from public.projects where owner_id = auth.uid()));
create policy "Project-scoped insert" on public.tokens
  for insert with check (project_id in (select id from public.projects where owner_id = auth.uid()));
create policy "Project-scoped update" on public.tokens
  for update using (project_id in (select id from public.projects where owner_id = auth.uid()));

create policy "Project-scoped select" on public.components
  for select using (project_id in (select id from public.projects where owner_id = auth.uid()));
create policy "Project-scoped insert" on public.components
  for insert with check (project_id in (select id from public.projects where owner_id = auth.uid()));
create policy "Project-scoped update" on public.components
  for update using (project_id in (select id from public.projects where owner_id = auth.uid()));

create policy "Project-scoped select" on public.patches
  for select using (project_id in (select id from public.projects where owner_id = auth.uid()));
create policy "Project-scoped insert" on public.patches
  for insert with check (project_id in (select id from public.projects where owner_id = auth.uid()));

create policy "Project-scoped select" on public.project_ai_keys
  for select using (project_id in (select id from public.projects where owner_id = auth.uid()));
create policy "Project-scoped insert" on public.project_ai_keys
  for insert with check (project_id in (select id from public.projects where owner_id = auth.uid()));

create policy "Project-scoped select" on public.llm_usage
  for select using (project_id in (select id from public.projects where owner_id = auth.uid()));
create policy "Project-scoped insert" on public.llm_usage
  for insert with check (project_id in (select id from public.projects where owner_id = auth.uid()));

-- Storage bucket for import files
insert into storage.buckets (id, name, public, file_size_limit)
values ('imports', 'imports', false, 52428800)  -- 50MB
on conflict (id) do nothing;

-- Storage RLS: users can upload to their project paths
create policy "Project-scoped upload" on storage.objects
  for insert with check (
    bucket_id = 'imports'
    and (storage.foldername(name))[1] in (
      select id::text from public.projects where owner_id = auth.uid()
    )
  );
create policy "Project-scoped read" on storage.objects
  for select using (
    bucket_id = 'imports'
    and (storage.foldername(name))[1] in (
      select id::text from public.projects where owner_id = auth.uid()
    )
  );
