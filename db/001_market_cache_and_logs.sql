-- Step 1: saved market results (Carlist + Mudah) and an error log.
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste this file -> Run.
-- Safe to run twice: "if not exists" skips anything that is already there.

-- Every Carlist scrape is saved as a new row. Rows are never deleted automatically;
-- the API reuses the newest row from the last 7 days, otherwise it scrapes again.
create table if not exists public.temporary_carlist (
  id              bigint generated always as identity primary key, -- unique key for each saved scrape
  search_key      text        not null, -- all search inputs combined; the same search always gives the same key
  vehicle_key     text        not null, -- identifies the car itself (make/model/variant/body/year), used later for linking to insurable
  scraper_version integer     not null, -- raised whenever scraping/matching code changes, so older results are ignored
  search_inputs   jsonb       not null, -- the inputs that produced this result (for admins)
  listings        jsonb       not null, -- raw scraped listings, filtered when read
  listing_count   integer     not null,
  scraped_at      timestamptz not null default now()
);
create index if not exists temporary_carlist_lookup on public.temporary_carlist (search_key, scraper_version, scraped_at desc);
create index if not exists temporary_carlist_scraped_at on public.temporary_carlist (scraped_at);

create table if not exists public.temporary_mudah (
  id              bigint generated always as identity primary key,
  search_key      text        not null,
  vehicle_key     text        not null,
  scraper_version integer     not null,
  search_inputs   jsonb       not null,
  listings        jsonb       not null,
  listing_count   integer     not null,
  scraped_at      timestamptz not null default now()
);
create index if not exists temporary_mudah_lookup on public.temporary_mudah (search_key, scraper_version, scraped_at desc);
create index if not exists temporary_mudah_scraped_at on public.temporary_mudah (scraped_at);

-- Problems the API runs into (failed scrapes, database errors), so admins can review them.
create table if not exists public.error_logs (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  source        text        not null, -- 'carlist', 'mudah', 'insurable', 'cache'
  error_type    text        not null, -- e.g. 'scrape_failed', 'db_error'
  message       text,
  search_inputs jsonb
);
create index if not exists error_logs_created_at on public.error_logs (created_at desc);

-- Row Level Security with no policies: browsers (anon key) cannot read or write these tables.
-- Only the FastAPI server, which uses the service role key, can.
alter table public.temporary_carlist enable row level security;
alter table public.temporary_mudah   enable row level security;
alter table public.error_logs        enable row level security;
