create table public.persons (
  id            bigint generated always as identity primary key,
  user_id       uuid          not null unique references auth.users(id) on delete cascade,
  full_name     varchar(300)  not null,
  phone_dial_code varchar(5),
  phone_number  varchar(15),
  score_data    jsonb         not null default '{}'::jsonb,
  -- { score, timestamp, company, scenario, source, pillars, answers }
  progress_data jsonb         not null default '{}'::jsonb
  -- { weeklyProgress: [{ weekStart, weekEnd, done }], weekLimit }
);

alter table public.persons enable row level security;

create policy "select own person"
  on public.persons
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "update own person"
  on public.persons
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
    coalesce(new.raw_user_meta_data -> 'score_data', '{}'::jsonb)
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();
