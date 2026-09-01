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

-- Admin-managed clipper profile fields (no-op if present).
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists verified boolean;
alter table public.profiles add column if not exists verified_at timestamptz;
alter table public.profiles add column if not exists risk_flag boolean;
alter table public.profiles add column if not exists risk_note text;
alter table public.profiles add column if not exists admin_notes text;
alter table public.profiles add column if not exists suspended_reason text;
alter table public.profiles add column if not exists appeals jsonb;
alter table public.profiles add column if not exists audit jsonb;
alter table public.profiles add column if not exists company text;
alter table public.profiles add column if not exists team jsonb;

-- Payout ledger columns on clips (no-op if present).
alter table public.clips add column if not exists txn_id text;
alter table public.clips add column if not exists payout_ref text;
alter table public.clips add column if not exists held_reason text;
alter table public.clips add column if not exists updated_at timestamptz;
alter table public.clips add column if not exists payout_date timestamptz;

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

-- Helper: is the current user the seeded super-admin (holds every permission)?
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and email = 'workclip11@gmail.com'
  );
$$;

-- Fine-grained admin permissions: which sensitive actions each admin may do.
-- Grant/revoke rows here, e.g.
--   insert into public.admin_permissions (admin_id, permission)
--   values ('<admin-uuid>', 'clipper.suspend');
create table if not exists public.admin_permissions (
  admin_id   uuid not null references auth.users (id) on delete cascade,
  permission text not null,
  primary key (admin_id, permission)
);

alter table public.admin_permissions enable row level security;

drop policy if exists "admin_perms_select" on public.admin_permissions;
create policy "admin_perms_select" on public.admin_permissions
  for select using (public.is_admin());

drop policy if exists "admin_perms_write" on public.admin_permissions;
create policy "admin_perms_write" on public.admin_permissions
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Helper: does the current admin hold a specific fine-grained permission?
-- The super-admin implicitly holds all permissions.
create or replace function public.admin_has_perm(perm text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.admin_permissions ap
      join public.profiles p on p.id = ap.admin_id
      where p.id = auth.uid() and p.role = 'admin' and ap.permission = perm
    );
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (
    auth.uid() = id
    AND role IN ('clipper', 'creator')
  );

-- UPDATE is gated per sensitive field. A clipper may edit their own row; an
-- admin may change a field only if they hold the matching permission (the
-- super-admin holds all). Non-sensitive fields (name, upi, ...) are free.
-- SECURITY: role can ONLY be changed by admins (via adminProfilePatch).
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_delete" on public.profiles;
create policy "profiles_delete" on public.profiles
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Trigger: enforce field-level permissions on profiles updates.
-- Non-admins can only change name, upi, username, company, team.
-- Admin-only fields: role, status, verified, risk_flag, admin_notes, etc.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_profile_field_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins can change anything (skip checks)
  if public.is_admin() then
    return NEW;
  end if;

  -- Non-admins: block changes to privileged fields
  if (OLD.role IS DISTINCT FROM NEW.role) then
    raise exception 'Only admins can change role';
  end if;
  if (OLD.status IS DISTINCT FROM NEW.status) then
    raise exception 'Only admins can change status';
  end if;
  if (OLD.verified IS DISTINCT FROM NEW.verified) then
    raise exception 'Only admins can change verified status';
  end if;
  if (OLD.verified_at IS DISTINCT FROM NEW.verified_at) then
    raise exception 'Only admins can change verified_at';
  end if;
  if (OLD.risk_flag IS DISTINCT FROM NEW.risk_flag) then
    raise exception 'Only admins can change risk_flag';
  end if;
  if (OLD.risk_note IS DISTINCT FROM NEW.risk_note) then
    raise exception 'Only admins can change risk_note';
  end if;
  if (OLD.admin_notes IS DISTINCT FROM NEW.admin_notes) then
    raise exception 'Only admins can change admin_notes';
  end if;
  if (OLD.suspended_reason IS DISTINCT FROM NEW.suspended_reason) then
    raise exception 'Only admins can change suspended_reason';
  end if;
  if (OLD.appeals IS DISTINCT FROM NEW.appeals) then
    raise exception 'Only admins can change appeals';
  end if;
  if (OLD.audit IS DISTINCT FROM NEW.audit) then
    raise exception 'Only admins can change audit';
  end if;

  return NEW;
end;
$$;

drop trigger if exists enforce_profile_fields on public.profiles;
create trigger enforce_profile_fields
  before update on public.profiles
  for each row
  execute function public.enforce_profile_field_permissions();

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

-- SECURITY NOTE: site_settings is world-readable because the public homepage
-- needs hero_title/hero_subtitle/featured_ids. The razorpay_key column should
-- only be used server-side (API routes) and never sent to the browser. If this
-- becomes a concern, split into a public view (without key) and an admin-only table.
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

-- Additive columns for engagement metrics + an audit trail of every status
-- change (who did what, when, optional note). Idempotent on re-run.
alter table public.clips add column if not exists engagement jsonb;
alter table public.clips add column if not exists audit jsonb;

-- Campaign audit trail of creator management actions (edit / pause / resume /
-- end / budget changes / rule changes). Idempotent on re-run.
alter table public.campaigns add column if not exists audit jsonb;

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

grant execute on function public.user_exists(text) to authenticated;

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

-- Notifications table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null,
  related_id text,
  read boolean default false,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_read_idx on public.notifications(read);

-- RLS: users can only read/modify their own notifications; admins can read all.
alter table public.notifications enable row level security;

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications
  for insert with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications
  for update using (auth.uid() = user_id or public.is_admin());

drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications
  for delete using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- Audit Log — append-only record of all admin actions
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id             text primary key,
  timestamp      timestamptz not null default now(),
  actor          text not null,
  action         text not null,
  target_type    text not null,
  target_id      text not null,
  target_label   text,
  previous_value text,
  new_value      text,
  reason         text
);

-- Indexes for search and filtering
create index if not exists audit_logs_timestamp_idx on public.audit_logs(timestamp desc);
create index if not exists audit_logs_action_idx on public.audit_logs(action);
create index if not exists audit_logs_target_type_idx on public.audit_logs(target_type);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor);
create index if not exists audit_logs_target_id_idx on public.audit_logs(target_id);

-- RLS: only admins can read audit logs; only admins can insert (append-only).
-- No UPDATE or DELETE allowed — audit trail is immutable.
alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs
  for select using (public.is_admin());

drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs
  for insert with check (public.is_admin());

-- No UPDATE or DELETE policies = those operations are denied by default.
