-- Add patrimony_data to persons to track housing status
alter table public.persons
  add column if not exists patrimony_data jsonb not null default '{}'::jsonb;
-- { housing_status: 'owned' | 'mortgage' | 'rented' | null }

-- ── ASSETS ────────────────────────────────────────────────────────────────────

create table public.patrimony_assets (
  id         bigint generated always as identity primary key,
  person_id  bigint      not null references public.persons(id) on delete cascade,
  name       text        not null,
  type       text        not null,
  -- housing | savings_account | term_deposit | severance_fund | pension_fund | vehicle | business | investments | other
  value      bigint      not null default 0,
  created_at timestamptz not null default now()
);

create index patrimony_assets_person_id_idx
  on public.patrimony_assets (person_id);

alter table public.patrimony_assets enable row level security;

create policy "select own assets"
  on public.patrimony_assets for select to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "insert own assets"
  on public.patrimony_assets for insert to authenticated
  with check (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "update own assets"
  on public.patrimony_assets for update to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "delete own assets"
  on public.patrimony_assets for delete to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));

-- ── LIABILITIES ───────────────────────────────────────────────────────────────

create table public.patrimony_liabilities (
  id         bigint generated always as identity primary key,
  person_id  bigint      not null references public.persons(id) on delete cascade,
  name       text        not null,
  type       text        not null,
  -- credit_card | consumer_loan | vehicle_loan | mortgage | informal_debt | other
  value      bigint      not null default 0,
  created_at timestamptz not null default now()
);

create index patrimony_liabilities_person_id_idx
  on public.patrimony_liabilities (person_id);

alter table public.patrimony_liabilities enable row level security;

create policy "select own liabilities"
  on public.patrimony_liabilities for select to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "insert own liabilities"
  on public.patrimony_liabilities for insert to authenticated
  with check (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "update own liabilities"
  on public.patrimony_liabilities for update to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "delete own liabilities"
  on public.patrimony_liabilities for delete to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));
