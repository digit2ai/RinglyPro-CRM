-- Replace patrimony_assets and patrimony_liabilities with a single
-- persons_patrimony table that stores both lists as JSON arrays.

drop table if exists public.patrimony_liabilities cascade;
drop table if exists public.patrimony_assets      cascade;

-- ── PERSONS PATRIMONY ─────────────────────────────────────────────────────────
-- One row per person; assets and liabilities stored as JSON arrays.
-- Each item shape: { id, person_id, name, type, value, created_at }

create table public.persons_patrimony (
  id               bigint generated always as identity primary key,
  person_id        bigint not null unique references public.persons(id) on delete cascade,
  assets_data      jsonb  not null default '[]'::jsonb,
  liabilities_data jsonb  not null default '[]'::jsonb
);

alter table public.persons_patrimony enable row level security;

create policy "select own patrimony"
  on public.persons_patrimony for select to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "insert own patrimony"
  on public.persons_patrimony for insert to authenticated
  with check (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "update own patrimony"
  on public.persons_patrimony for update to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "delete own patrimony"
  on public.persons_patrimony for delete to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));
