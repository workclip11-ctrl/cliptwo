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
  created_at timestamptz not null default now()
);

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
