-- ─────────────────────────────────────────────────────────────────────────────
-- PRDCR Clients Migration
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Clients ──────────────────────────────────────────────────────────────────
create table if not exists clients (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  color         text        not null default '#3b82f6',
  contact_name  text,
  contact_email text,
  notes         text,
  created_at    timestamptz not null default now()
);

-- ── Link projects to clients ──────────────────────────────────────────────────
alter table projects
  add column if not exists client_id uuid references clients(id) on delete set null;

create index if not exists projects_client_id_idx on projects(client_id);
create index if not exists clients_created_at_idx  on clients(created_at desc);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table clients enable row level security;
create policy "allow_all" on clients for all using (true) with check (true);

-- ── Migrate existing project client text into clients table ───────────────────
-- This creates a clients row for each unique client name already in projects,
-- then links those projects to the newly created client rows.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
do $$
declare
  r record;
  new_client_id uuid;
begin
  for r in
    select distinct client from projects where client is not null and client != ''
  loop
    insert into clients (name)
    values (r.client)
    on conflict do nothing
    returning id into new_client_id;

    if new_client_id is not null then
      update projects set client_id = new_client_id where client = r.client;
    end if;
  end loop;
end;
$$;
