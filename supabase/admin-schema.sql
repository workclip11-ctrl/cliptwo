-- cliptwo admin extension
-- Run this in Supabase Dashboard -> SQL Editor -> Run.
-- Additive only: it does NOT drop the existing campaigns/clips tables or data.

-- ---------------------------------------------------------------------------
-- profiles (one row per auth user) — MUST exist before the is_admin() helper
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  email      text not null default '',
  role       text not null default 'clipper',
  status     text not null default 'active',
  upi        text,
  created_at timestamptz not null default now()
);

-- Add the payout UPI column to existing profiles tables (no-op if present).
alter table public.profiles add column if not exists upi text;

-- Helper: is the current user an admin? (reads the public.profiles table)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- site_settings (single row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  id           integer primary key default 1,
  hero_title   text,
  hero_subtitle text,
  featured_ids text[] not null default '{}',
  razorpay_key text,
  updated_at   timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "site_settings_select" on public.site_settings;
create policy "site_settings_select" on public.site_settings
  for select using (true);

drop policy if exists "site_settings_all" on public.site_settings;
create policy "site_settings_all" on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed the single settings row if it does not exist yet.
insert into public.site_settings (id, hero_title, hero_subtitle, featured_ids, razorpay_key)
values (1, '', '', '{}', '')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- let admins also manage campaigns (close / delete) + clips
-- ---------------------------------------------------------------------------
drop policy if exists "campaigns_update" on public.campaigns;
create policy "campaigns_update" on public.campaigns
  for update using (auth.uid() = created_by or public.is_admin());

drop policy if exists "campaigns_delete" on public.campaigns;
create policy "campaigns_delete" on public.campaigns
  for delete using (auth.uid() = created_by or public.is_admin());

-- Clips: only the owner (or an admin) may edit / delete a clip. The base
-- schema used `auth.role() = 'authenticated'`, which let ANY signed-in user
-- tamper with anyone's clip (e.g. mark another clipper's clip as paid).
drop policy if exists "clips_update" on public.clips;
create policy "clips_update" on public.clips
  for update using (auth.uid() = user_id or public.is_admin());

drop policy if exists "clips_delete" on public.clips;
create policy "clips_delete" on public.clips
  for delete using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- helper: does an account with this email already exist? (used by the login
-- page to tell "new user" apart from "wrong password"). Callable by anon so
-- the unauthenticated login form can use it.
-- ---------------------------------------------------------------------------
create or replace function public.user_exists(target_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from auth.users where email = target_email);
$$;

grant execute on function public.user_exists(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- campaigns — add columns used by the multi-step campaign creation wizard.
-- Additive only (no drop), safe to re-run on existing databases.
-- ---------------------------------------------------------------------------
alter table public.campaigns add column if not exists thumbnails jsonb;
alter table public.campaigns add column if not exists brand_assets jsonb;
alter table public.campaigns add column if not exists spend_cap numeric;
alter table public.campaigns add column if not exists timezone text;
alter table public.campaigns add column if not exists what_to_make text;
alter table public.campaigns add column if not exists style text;
alter table public.campaigns add column if not exists rights jsonb;

-- ---------------------------------------------------------------------------
-- social_accounts — a clipper's connected publishing platforms.
-- SECURITY: stores ONLY non-secret metadata. OAuth tokens / client secrets /
-- service-role keys MUST NEVER live here or reach the browser; real platform
-- credentials belong in a server-only secret store (Supabase Vault / encrypted
-- column with RLS forbidding SELECT) and are read solely by backend jobs that
-- later power view tracking.
-- ---------------------------------------------------------------------------
create table if not exists public.social_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,
  platform      text not null,
  handle        text not null,
  status        text not null default 'not_connected',
  verified      boolean not null default false,
  connected_at  timestamptz,
  last_sync_at  timestamptz,
  error         text,
  created_at    timestamptz not null default now()
);

alter table public.social_accounts enable row level security;

drop policy if exists "social_accounts_select" on public.social_accounts;
create policy "social_accounts_select" on public.social_accounts
  for select using (auth.uid() = user_id);

drop policy if exists "social_accounts_insert" on public.social_accounts;
create policy "social_accounts_insert" on public.social_accounts
  for insert with check (auth.uid() = user_id);

drop policy if exists "social_accounts_update" on public.social_accounts;
create policy "social_accounts_update" on public.social_accounts
  for update using (auth.uid() = user_id);

drop policy if exists "social_accounts_delete" on public.social_accounts;
create policy "social_accounts_delete" on public.social_accounts
  for delete using (auth.uid() = user_id);
