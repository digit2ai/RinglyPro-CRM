create table public.roles (
  id int generated always as identity primary key,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create table public.permissions (
  id int generated always as identity primary key,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

create table public.user_roles (
  id int generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id int not null references public.roles(id) on delete cascade,
  unique (user_id, role_id)
);

create table public.user_permissions (
  id int generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_id int not null references public.permissions(id) on delete cascade,
  unique (user_id, permission_id)
);

create table public.role_permissions (
  id int generated always as identity primary key,
  role_id int not null references public.roles(id) on delete cascade,
  permission_id int not null references public.permissions(id) on delete cascade,
  unique (role_id, permission_id)
);

-- RLS

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.role_permissions enable row level security;

-- roles: any authenticated user can read (reference table)
create policy "select roles"
  on public.roles
  for select
  to authenticated
  using (true);

-- permissions: any authenticated user can read (reference table)
create policy "select permissions"
  on public.permissions
  for select
  to authenticated
  using (true);

-- user_roles: users can only read their own rows
create policy "select own user_roles"
  on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- user_permissions: users can only read their own rows
create policy "select own user_permissions"
  on public.user_permissions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- role_permissions: any authenticated user can read (reference data)
create policy "select role_permissions"
  on public.role_permissions
  for select
  to authenticated
  using (true);
