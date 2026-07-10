create table public.persons_long_term_goals (
  id              bigint generated always as identity primary key,
  person_id       bigint      not null references public.persons(id) on delete cascade,
  name            text        not null,
  type            text        not null,
  -- trip | house | car | education | other
  target_amount   bigint      not null,
  current_savings bigint      not null default 0,
  monthly_saving  bigint      not null default 0,
  created_at      timestamptz not null default now()
);

create index persons_long_term_goals_person_id_idx
  on public.persons_long_term_goals (person_id);

alter table public.persons_long_term_goals enable row level security;

create policy "select own long_term_goals"
  on public.persons_long_term_goals for select to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "insert own long_term_goals"
  on public.persons_long_term_goals for insert to authenticated
  with check (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "update own long_term_goals"
  on public.persons_long_term_goals for update to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));

create policy "delete own long_term_goals"
  on public.persons_long_term_goals for delete to authenticated
  using (person_id in (select id from public.persons where user_id = (select auth.uid())));
