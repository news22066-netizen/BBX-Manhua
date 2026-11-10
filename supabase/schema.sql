-- Run in Supabase: SQL Editor -> New query -> Run
create extension if not exists "pgcrypto";

create table if not exists manhuas (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  cover_url   text,
  source_id   text not null unique,          -- MangaDex manga UUID
  -- extras that the UI needs (rating stars, genre filter, popularity sort)
  rating      numeric(3,1),                  -- 0-10 (UI converts to 5 stars)
  follows     integer default 0,
  genres      text[] not null default '{}',
  status      text,
  created_at  timestamptz not null default now()
);

create table if not exists chapters (
  id                uuid primary key default gen_random_uuid(),
  manhua_id         uuid not null references manhuas(id) on delete cascade,
  chapter_number    numeric not null,
  title             text,
  source_chapter_id text not null,           -- MangaDex chapter UUID
  published_at      timestamptz,
  unique (manhua_id, chapter_number)
);

create index if not exists chapters_manhua_idx on chapters (manhua_id, chapter_number desc);
create index if not exists manhuas_follows_idx on manhuas (follows desc);
create index if not exists manhuas_genres_gin  on manhuas using gin (genres);

-- Public read-only access for the anon key. Writes need the service role key (seed script).
alter table manhuas  enable row level security;
alter table chapters enable row level security;
drop policy if exists "public read manhuas"  on manhuas;
drop policy if exists "public read chapters" on chapters;
create policy "public read manhuas"  on manhuas  for select using (true);
create policy "public read chapters" on chapters for select using (true);

-- ===== Added for paginated home page (safe to run again) =====
-- Fast distinct genre list across ALL manhua (used by the genre section).
create or replace function get_genres()
returns table (genre text)
language sql stable
as $$ select distinct unnest(genres) as genre from manhuas order by 1; $$;
grant execute on function get_genres() to anon, authenticated;

-- Makes title search (ILIKE '%text%') fast even with thousands of manhua.
create extension if not exists pg_trgm;
create index if not exists manhuas_title_trgm on manhuas using gin (title gin_trgm_ops);
