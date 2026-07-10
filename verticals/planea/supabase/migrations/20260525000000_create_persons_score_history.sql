-- 1. Create persons_score_history

create table public.persons_score_history (
  id          bigint generated always as identity primary key,
  person_id   bigint      not null references public.persons(id) on delete cascade,
  scored_at   timestamptz not null,
  score_data  jsonb       not null default '{}'::jsonb
  -- { score, company, scenario, source, pillars, answers, timestamp }
);

create index persons_score_history_person_id_scored_at_idx
  on public.persons_score_history (person_id, scored_at desc);

alter table public.persons_score_history enable row level security;

create policy "select own persons_score_history"
  on public.persons_score_history
  for select
  to authenticated
  using (
    person_id in (
      select id from public.persons where user_id = (select auth.uid())
    )
  );

create policy "insert own persons_score_history"
  on public.persons_score_history
  for insert
  to authenticated
  with check (
    person_id in (
      select id from public.persons where user_id = (select auth.uid())
    )
  );

-- 2. Update handle_new_user to also record an initial score entry when present

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_score_data jsonb;
  v_person_id  bigint;
begin
  v_score_data := coalesce(new.raw_user_meta_data -> 'score_data', '{}'::jsonb);

  insert into public.persons (
    user_id,
    full_name,
    phone_dial_code,
    phone_number,
    score_data
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    null,
    null,
    v_score_data
  )
  returning id into v_person_id;

  if (v_score_data ->> 'score') is not null then
    insert into public.persons_score_history (person_id, scored_at, score_data)
    values (
      v_person_id,
      coalesce((v_score_data ->> 'timestamp')::timestamptz, now()),
      v_score_data
    );
  end if;

  return new;
end;
$$;
