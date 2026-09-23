-- ==========================================================================
-- OAuth intent handoff: stop trigger from pre-empting role finalization
--
-- Root cause of the OAuth role-routing bug:
--   1. signInWithOAuth `queryParams: { role }` are forwarded to Google and
--      discarded there — Supabase never writes them to user_metadata.
--   2. This trigger then fired synchronously at auth.users INSERT (code
--      exchange, before /auth/complete runs) and defaulted role-less OAuth
--      newcomers to 'clipper'.
--   3. finalize_profile() (existing-wins) and /auth/complete then treated
--      every new OAuth user as an existing clipper → Creator CTA always
--      landed on /clipper.
--
-- Fix: the trigger now auto-creates a profile ONLY when user metadata carries
-- an explicit 'clipper' | 'creator' role (always true for email signups via
-- signUp options.data — that flow is unchanged). OAuth newcomers WITHOUT a
-- metadata role are left profile-less so /auth/complete can finalize them
-- with the transaction intent via finalize_profile().
--
-- What is preserved:
--   - Email signup flows (clipper/creator via metadata) — byte-identical.
--   - Admin can never be created via trigger (admin/invalid/absent role now
--     creates NO profile; finalize_profile/ensureProfile default to clipper).
--   - Idempotency guard (IF NOT EXISTS) and trigger itself are untouched.
--   - SECURITY DEFINER + SET search_path = public are unchanged.
--   - RLS policies and finalize_profile() are NOT modified here.
--
-- Safety net for skipped users: client ensureProfile() backfills a profile
-- on every app page except /auth/complete, and finalize_profile() creates it
-- during completion. No user can end up permanently profile-less.
-- ==========================================================================

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
    -- Read role from user metadata. Email signups always carry an explicit
    -- role (set by signUp()). Google OAuth signups do NOT (OAuth queryParams
    -- never reach user_metadata) — those users are intentionally left
    -- profile-less here so the OAuth intent handoff in /auth/complete can
    -- finalize them with the correct role via finalize_profile().
    user_role := NEW.raw_user_meta_data ->> 'role';
    if user_role is null or user_role not in ('clipper', 'creator') then
      return NEW;
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
