-- ============================================================================
-- cliptwo — admin account setup
-- ============================================================================
-- IMPORTANT: Do NOT hand-insert into auth.users. Inserting directly (with a
-- hardcoded instance_id / password hash) produces a malformed row that makes
-- Supabase Auth return "Database error querying schema" on sign-in.
--
-- Instead:
--   1. Go to Supabase Dashboard → Authentication → Users → "Add user".
--   2. Email:   workclip11@gmail.com
--      Password: 123456
--      Check "Auto Confirm User" (so email confirmation is not required).
--   3. Then run THIS script (it just tags the existing user as admin).
--
-- If you already created workclip11@gmail.com through the old SQL, delete that
-- user from the Auth dashboard first, then re-add it via the UI (step 1-2).
-- ============================================================================

-- Promote an existing (dashboard-created) user to admin. Idempotent.
update auth.users
set raw_user_meta_data =
      coalesce(raw_user_meta_data, '{}'::jsonb) ||
      jsonb_build_object('name', 'Admin', 'role', 'admin')
where email = 'workclip11@gmail.com';

-- Mirror the role into the public profiles table (used by the admin panel).
insert into public.profiles (id, name, email, role, status, created_at)
select id, 'Admin', email, 'admin', 'active', now()
from auth.users
where email = 'workclip11@gmail.com'
on conflict (id) do update
  set role = 'admin', status = 'active';
