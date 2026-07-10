create table if not exists public.contact_request_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  message     text not null,
  status      text not null default 'pending' check (status in ('pending', 'read', 'archived')),
  created_at  timestamptz not null default now()
);

-- Índices
create index if not exists contact_request_messages_status_idx
  on public.contact_request_messages (status);

create index if not exists contact_request_messages_created_at_idx
  on public.contact_request_messages (created_at desc);

-- RLS: solo service_role puede leer/modificar; inserción pública permitida
alter table public.contact_request_messages enable row level security;

create policy "Allow public insert"
  on public.contact_request_messages
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow service_role full access"
  on public.contact_request_messages
  for all
  to service_role
  using (true)
  with check (true);
