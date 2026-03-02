-- ─────────────────────────────────────────────────────────────────────────
-- PRDCR Database Schema
-- Run this entire file once in: Supabase Dashboard → SQL Editor → New query
-- ─────────────────────────────────────────────────────────────────────────


-- ── Projects ─────────────────────────────────────────────────────────────
create table if not exists projects (
  id            uuid        primary key default gen_random_uuid(),
  title         text        not null,
  client        text,
  status        text        not null default 'idea'
                            check (status in ('idea','pre-production','filming','editing','review','delivered')),
  brief         text,
  due_date      date,
  ongoing       boolean     not null default false,
  frameio_link  text,
  drive_link    text,
  editor_name   text,
  editor_email  text,
  client_email  text,
  color         text        not null default '#3b82f6',
  created_at    timestamptz not null default now()
);


-- ── Edit Versions (linked to a project, auto-deleted with it) ─────────────
create table if not exists edit_versions (
  id            uuid        primary key default gen_random_uuid(),
  project_id    uuid        not null references projects(id) on delete cascade,
  version       integer     not null,
  label         text        not null,
  status        text        not null default 'not-started'
                            check (status in ('not-started','in-progress','draft-sent','changes-requested','approved')),
  sent_at       date,
  notes         text,
  frameio_link  text,
  created_at    timestamptz not null default now()
);


-- ── Phases (concurrent project stages with their own timelines) ───────────
create table if not exists phases (
  id            uuid        primary key default gen_random_uuid(),
  project_id    uuid        not null references projects(id) on delete cascade,
  name          text        not null,
  status        text        not null default 'upcoming'
                            check (status in ('upcoming','active','complete')),
  start_date    date        not null,
  end_date      date,
  notes         text,
  created_at    timestamptz not null default now()
);


-- ── Tasks (optionally linked to a project) ────────────────────────────────
create table if not exists tasks (
  id            uuid        primary key default gen_random_uuid(),
  title         text        not null,
  completed     boolean     not null default false,
  project_id    uuid        references projects(id) on delete set null,
  due_date      date,
  priority      text        not null default 'medium'
                            check (priority in ('high','medium','low')),
  assigned_to   text,
  links         jsonb       not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);


-- ── Indexes ───────────────────────────────────────────────────────────────
create index if not exists tasks_project_id_idx          on tasks(project_id);
create index if not exists tasks_due_date_idx            on tasks(due_date);
create index if not exists tasks_completed_idx           on tasks(completed);
create index if not exists edit_versions_project_id_idx  on edit_versions(project_id);
create index if not exists phases_project_id_idx         on phases(project_id);
create index if not exists phases_start_date_idx         on phases(start_date);


-- ── Row Level Security ────────────────────────────────────────────────────
-- Permissive for now (personal tool, no auth). Lock down when you add login.
alter table projects      enable row level security;
alter table edit_versions enable row level security;
alter table phases        enable row level security;
alter table tasks         enable row level security;

create policy "allow_all" on projects      for all using (true) with check (true);
create policy "allow_all" on edit_versions for all using (true) with check (true);
create policy "allow_all" on phases        for all using (true) with check (true);
create policy "allow_all" on tasks         for all using (true) with check (true);


-- ── Seed Data ─────────────────────────────────────────────────────────────
-- Matches the mock data from development — gives you something to work with immediately
insert into projects (id, title, client, status, brief, due_date, ongoing, frameio_link, drive_link, editor_name, editor_email, client_email, color, created_at) values
(
  'a1000000-0000-0000-0000-000000000001',
  'Brand Film', 'Nike', 'filming',
  'A 90-second brand film for Nike''s Spring 2026 running campaign. Focus on everyday athletes in urban environments. Tone: gritty, real, aspirational. Deliverables: 1x 90s hero film, 3x 15s cutdowns for social.',
  '2026-03-28', false, 'https://app.frame.io/reviews/nike', null,
  'James Okafor', 'james@edithaus.co', 'marketing@nike.com', '#f59e0b',
  '2026-01-15 00:00:00+00'
),
(
  'a2000000-0000-0000-0000-000000000002',
  'Product Launch Film', 'Aesop', 'editing',
  'A slow, tactile product film launching Aesop''s new body care range. No dialogue. Focus on texture, light, and ritual. 60 seconds. Deliver in 4K. Tone: quiet luxury.',
  '2026-04-10', false, 'https://app.frame.io/reviews/aesop', 'https://drive.google.com/drive/folders/aesop',
  'James Okafor', 'james@edithaus.co', 'content@aesop.com', '#8b5cf6',
  '2026-02-01 00:00:00+00'
),
(
  'a3000000-0000-0000-0000-000000000003',
  'March Content Pack', 'Studio Selects', 'idea',
  'Monthly content pack for Studio Selects Instagram and TikTok. 8x short-form videos (15–30s each). Shoot 2 days in studio. Lifestyle and product mixed.',
  '2026-03-31', false, null, null, null, null, 'hi@studioselects.com', '#3b82f6',
  '2026-02-20 00:00:00+00'
)
on conflict (id) do nothing;

insert into edit_versions (project_id, version, label, status, sent_at, notes, frameio_link) values
('a1000000-0000-0000-0000-000000000001', 1, 'v1', 'approved',           '2026-01-10', 'Rough cut. Client happy with pacing, requested colour grade adjustment.', 'https://app.frame.io/reviews/nike-v1'),
('a1000000-0000-0000-0000-000000000001', 2, 'v2', 'changes-requested',  '2026-02-01', 'Colour graded. Client wants the final 10 seconds reworked.',             'https://app.frame.io/reviews/nike-v2'),
('a1000000-0000-0000-0000-000000000001', 3, 'v3', 'in-progress',        null,         'Final 10s rework in progress.',                                           null),
('a2000000-0000-0000-0000-000000000002', 1, 'v1', 'draft-sent',         '2026-02-15', 'First assembly cut sent to client.',                                      'https://app.frame.io/reviews/aesop-v1');

-- Nike: overlapping phases — filming days 2–3 running while day 1 footage is being edited
insert into phases (project_id, name, status, start_date, end_date, notes) values
('a1000000-0000-0000-0000-000000000001', 'Pre-Production',  'complete', '2026-01-10', '2026-01-28', 'Location scouting, casting, logistics.'),
('a1000000-0000-0000-0000-000000000001', 'Filming — Day 1', 'complete', '2026-01-29', '2026-01-29', 'Urban run sequences. City centre.'),
('a1000000-0000-0000-0000-000000000001', 'Filming — Day 2', 'active',   '2026-02-20', '2026-02-20', 'Track and park sequences.'),
('a1000000-0000-0000-0000-000000000001', 'Editing',         'active',   '2026-02-01', null,         'Assembly cut of Day 1 footage. James cutting.'),
('a1000000-0000-0000-0000-000000000001', 'Colour Grade',    'upcoming', '2026-03-10', '2026-03-14', null),
('a1000000-0000-0000-0000-000000000001', 'Delivery',        'upcoming', '2026-03-28', '2026-03-28', '90s hero film + 3x 15s cutdowns.');

-- Aesop: in post, two phases running simultaneously
insert into phases (project_id, name, status, start_date, end_date, notes) values
('a2000000-0000-0000-0000-000000000002', 'Pre-Production',  'complete', '2026-02-01', '2026-02-10', 'Prop sourcing, lighting design, studio booking.'),
('a2000000-0000-0000-0000-000000000002', 'Filming',         'complete', '2026-02-11', '2026-02-12', 'Two-day studio shoot. All product beauty shots captured.'),
('a2000000-0000-0000-0000-000000000002', 'Editing',         'active',   '2026-02-15', null,         'Assembly cut sent. Awaiting client notes on v1.'),
('a2000000-0000-0000-0000-000000000002', 'Sound Design',    'active',   '2026-02-22', null,         'Working on ambient texture. No dialogue — sound is everything.'),
('a2000000-0000-0000-0000-000000000002', 'Colour Grade',    'upcoming', '2026-03-20', '2026-03-25', null),
('a2000000-0000-0000-0000-000000000002', 'Delivery',        'upcoming', '2026-04-10', '2026-04-10', '60s 4K master + compressed web version.');

-- Studio Selects: early stage, just pre-production active
insert into phases (project_id, name, status, start_date, end_date, notes) values
('a3000000-0000-0000-0000-000000000003', 'Pre-Production',  'active',   '2026-02-20', null,         'Concept approval and studio booking in progress.'),
('a3000000-0000-0000-0000-000000000003', 'Filming',         'upcoming', '2026-03-10', '2026-03-11', '2-day studio shoot. 8 short-form pieces.'),
('a3000000-0000-0000-0000-000000000003', 'Editing',         'upcoming', '2026-03-12', '2026-03-20', null),
('a3000000-0000-0000-0000-000000000003', 'Delivery',        'upcoming', '2026-03-31', '2026-03-31', 'Instagram + TikTok formats.');

insert into tasks (title, completed, project_id, due_date, priority) values
('Confirm shoot locations for day 3',  false, 'a1000000-0000-0000-0000-000000000001', '2026-02-25', 'high'),
('Send v3 to James once ready',        false, 'a1000000-0000-0000-0000-000000000001', '2026-03-01', 'high'),
('Book colour grade suite',            true,  'a1000000-0000-0000-0000-000000000001', null,         'medium'),
('Deliver social cutdowns',            false, 'a1000000-0000-0000-0000-000000000001', '2026-03-28', 'medium'),
('Review v1 and send notes to James',  false, 'a2000000-0000-0000-0000-000000000002', '2026-02-26', 'high'),
('Confirm music licence',              false, 'a2000000-0000-0000-0000-000000000002', '2026-03-05', 'medium'),
('Confirm concept with client',        false, 'a3000000-0000-0000-0000-000000000003', '2026-02-28', 'high'),
('Book studio space for March 10–11',  false, 'a3000000-0000-0000-0000-000000000003', '2026-02-28', 'high'),
('Renew Premiere Pro licence',         false, null,                                   '2026-03-01', 'low'),
('Chase James re: invoice',            false, null,                                   '2026-02-26', 'medium');


-- ── Migration: run these if the tasks table already exists ─────────────────
-- alter table tasks add column if not exists assigned_to text;
-- alter table tasks add column if not exists links jsonb not null default '[]'::jsonb;
