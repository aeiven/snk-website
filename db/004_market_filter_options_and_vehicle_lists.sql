-- Step 3: separate Insurable Value and Current Market Valuation pages.
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste this file -> Run.
-- Safe to run twice.

-- Carlist's own filter lists (variants, body types, years) for each make + model.
-- One row per make/model; the API refreshes a row when it is older than 30 days.
create table if not exists public.carlist_filter_options (
  id         bigint generated always as identity primary key,
  make       text        not null,
  model      text        not null,
  options    jsonb       not null,
  fetched_at timestamptz not null default now(),
  unique (make, model)
);
alter table public.carlist_filter_options enable row level security;

-- Distinct makes / models in our insurable database, for the Insurable Value dropdowns.
-- (Reading the vehicles table directly is capped at 1000 rows, which would miss most of them.)
create or replace function public.vehicle_makes()
returns table (make text)
language sql stable
set search_path = ''
as $$
  select distinct v.make from public.vehicles v where v.make is not null order by 1;
$$;

create or replace function public.vehicle_models(p_make text)
returns table (model text)
language sql stable
set search_path = ''
as $$
  select distinct v.model from public.vehicles v where v.make ilike p_make and v.model is not null order by 1;
$$;

-- Only the server (service role) may call these.
revoke execute on function public.vehicle_makes() from public, anon, authenticated;
revoke execute on function public.vehicle_models(text) from public, anon, authenticated;
grant execute on function public.vehicle_makes() to service_role;
grant execute on function public.vehicle_models(text) to service_role;
