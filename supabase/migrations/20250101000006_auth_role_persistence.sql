-- ==========================================================================
-- Auth role persistence
--
-- Ensures the role selected during signup (email or OAuth) is reliably
-- persisted to profiles.role, surviving email confirmation redirects and
-- cross-tab/cross-browser scenarios.
--
-- Components:
--   1. Trigger: auto-create profile for email/password signups
--   2. finalize_profile RPC: create profile for OAuth signups (called from
--      the completion page after role selection)
--   3. Grants for authenticated users
-- ==========================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger: auto-create profiles for email/password signups
--
-- Fires on INSERT into auth.users. For email/password signups, the role is
-- always in raw_user_meta_data (set by signUp()). For Google OAuth, the role
-- may or may not be present depending on whether it was pre-selected.
--
-- The trigger is a safety net. The primary profile creation path is
-- ensureProfile() in the client and finalize_profile() RPC.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role text;
begin
  -- Only create profile if one does not already exist
  if not exists (select 1 from public.profiles where id = NEW.id) then
    -- Read role from user metadata, default to 'clipper'
    user_role := NEW.raw_user_meta_data ->> 'role';
    if user_role is null or user_role not in ('clipper', 'creator', 'admin') then
      user_role := 'clipper';
    end if;
    -- Never allow admin self-assignment via trigger
    if user_role = 'admin' then
      user_role := 'clipper';
    end if;
    insert into public.profiles (id, name, email, role, status)
    values (
      NEW.id,
      coalesce(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1), 'User'),
      coalesce(NEW.email, ''),
      user_role,
      'active'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();

-- ---------------------------------------------------------------------------
-- 2. finalize_profile RPC
--
-- Called from the auth completion page to create the profile for OAuth users
-- who have just selected their role. Uses SECURITY DEFINER to bypass RLS.
--
-- Invariants:
--   - Only creates a profile if one does not exist (idempotent)
--   - Never allows admin role
--   - Derives user identity from auth.uid() (never trusts client-supplied user_id)
--   - Role comes from user_metadata or the p_role parameter (validated server-side)
-- ---------------------------------------------------------------------------
create or replace function public.finalize_profile(p_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  user_role text;
  user_name text;
  user_email text;
  existing_role text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Check if profile already exists — existing role MUST NOT be overwritten
  select role into existing_role from public.profiles where id = uid;
  if existing_role is not null then
    return jsonb_build_object('role', existing_role, 'created', false);
  end if;

  -- Determine role: prefer user_metadata, fall back to parameter
  user_role := (select raw_user_meta_data ->> 'role' from auth.users where id = uid);
  if user_role is null or user_role not in ('clipper', 'creator') then
    user_role := p_role;
  end if;
  if user_role is null or user_role not in ('clipper', 'creator') then
    user_role := 'clipper';
  end if;

  -- Never allow admin self-assignment
  if user_role = 'admin' then
    user_role := 'clipper';
  end if;

  -- Read name and email from auth.users
  select
    coalesce(raw_user_meta_data ->> 'name', split_part(email, '@', 1), 'User'),
    coalesce(email, '')
  into user_name, user_email
  from auth.users
  where id = uid;

  insert into public.profiles (id, name, email, role, status)
  values (uid, user_name, user_email, user_role, 'active');

  return jsonb_build_object('role', user_role, 'created', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
grant execute on function public.finalize_profile(text) to authenticated;
