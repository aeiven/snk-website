-- Step 2a: move role and tokens out of user_metadata (which every user can edit for themselves
-- from the browser) into app_metadata (which only the server, using the service role key, can change).
-- Run in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

-- PART A: copy the current values across.
-- Run this now (for local testing) and ONCE MORE right before deploying the new backend,
-- so token counts used on the live site in between are carried over.
-- Do NOT run it after deploying: it would overwrite the new counts with old ones.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
  'role',             coalesce(raw_user_meta_data->>'role', 'user'),
  'tokens_remaining', coalesce((raw_user_meta_data->>'tokens_remaining')::int, 3),
  'tokens_per_week',  coalesce((raw_user_meta_data->>'tokens_per_week')::int, 3),
  'last_refill_at',   coalesce(raw_user_meta_data->>'last_refill_at', now()::text)
);

-- PART B: give every new signup safe defaults. Users can no longer choose their own role or tokens.
-- Existing keys (like Supabase's own "provider") are kept.
create or replace function public.set_default_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.raw_app_meta_data := jsonb_build_object(
    'role',             'user',
    'tokens_remaining', 3,
    'tokens_per_week',  3,
    'last_refill_at',   now()
  ) || coalesce(new.raw_app_meta_data, '{}'::jsonb);
  return new;
end;
$$;

drop trigger if exists set_default_app_metadata on auth.users;
create trigger set_default_app_metadata
  before insert on auth.users
  for each row execute function public.set_default_app_metadata();

-- CHECK: should list the 5 admin accounts with role 'admin' in app_metadata.
select email, raw_app_meta_data->>'role' as role, raw_app_meta_data->>'tokens_remaining' as tokens
from auth.users
where raw_app_meta_data->>'role' in ('admin', 'master_admin');
