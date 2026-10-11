-- Run ONLY AFTER the new backend and frontend are deployed and working.
-- Removes the old, user-editable copies of role and tokens so nothing reads them by mistake.
-- Also switch off the old weekly refill job in Supabase at the same time; the API now refills tokens itself.
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'role' - 'tokens_remaining' - 'tokens_per_week' - 'last_refill_at';
