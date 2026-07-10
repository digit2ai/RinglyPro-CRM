-- persons.progress_data (already exists) stores the current goal as JSON:
-- {
--   pillar, status, valor_inicio,
--   hito_1_points, hito_2_points, hito_3_points, hito_4_points,
--   hito_1_date, hito_2_date, hito_3_date, hito_4_date,
--   goal_text, created_at, fecha_completada, next_goal_at
-- }

create table public.persons_goals_history (
  id           bigint generated always as identity primary key,
  person_id    bigint      not null references public.persons(id) on delete cascade,
  recorded_at  timestamptz not null,
  goal_data    jsonb       not null default '{}'::jsonb
  -- full UserGoal snapshot at the time of completion / expiry
);

create index persons_goals_history_person_id_recorded_at_idx
  on public.persons_goals_history (person_id, recorded_at desc);

alter table public.persons_goals_history enable row level security;

create policy "select own persons_goals_history"
  on public.persons_goals_history
  for select
  to authenticated
  using (
    person_id in (
      select id from public.persons where user_id = (select auth.uid())
    )
  );

create policy "insert own persons_goals_history"
  on public.persons_goals_history
  for insert
  to authenticated
  with check (
    person_id in (
      select id from public.persons where user_id = (select auth.uid())
    )
  );
