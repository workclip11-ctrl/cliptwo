-- cliptwo Supabase schema
-- Run this in Supabase Dashboard -> SQL Editor -> Run.
-- NOTE: this drops and recreates the tables, so any existing data is reset.
-- Drop dependent tables first to avoid foreign key constraint errors.

drop table if exists public.payouts cascade;
drop table if exists public.wallet_ledger cascade;
drop table if exists public.earnings cascade;
drop table if exists public.clip_metrics cascade;
drop table if exists public.metrics_sync_jobs cascade;
drop table if exists public.clips cascade;
drop table if exists public.campaigns cascade;

create table public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users (id) on delete set null,
  title       text not null,
  creator     text not null,
  niche       text,
  brief       text not null,
  platform    text not null,
  payout      numeric not null default 0 check (payout >= 0),
  status      text not null default 'open' check (status in ('open','closed','draft','paused','archived','budget_reached','near_budget')),
  budget      numeric not null default 0 check (budget >= 0),
  spent       numeric not null default 0 check (spent >= 0),
  days_left   integer not null default 30 check (days_left >= 0),
  source_link text,
  rules       text,
  category    text,
  platforms   jsonb,
  verified    boolean,
  objective   text,
  start_date  date,
  end_date    date,
  max_payout_per_clip numeric check (max_payout_per_clip is null or max_payout_per_clip >= 0),
  recommended_duration text,
  hook        text,
  caption_req text,
  aspect_ratio text,
  cta         text,
  branding    text,
  do_list     jsonb,
  dont_list   jsonb,
  source_assets jsonb,
  example_clips jsonb,
  view_rules  jsonb,
  approval    jsonb,
  thumbnails  jsonb,
  brand_assets jsonb,
  spend_cap   numeric check (spend_cap is null or spend_cap >= 0),
  timezone    text,
  what_to_make text,
  style       text,
  rights      jsonb,
  audit       jsonb,
  archived_at timestamptz,
  archived_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint campaigns_created_by_not_null check (created_by is not null)
);

create table public.clips (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references public.campaigns (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  clipper      text not null,
  caption      text not null,
  video_url    text not null,
  platform     text not null,
  views        integer not null default 0 check (views >= 0),
  verified_views integer not null default 0 check (verified_views >= 0),
   status       text not null default 'pending' check (status in ('pending','approved','rejected','held')),
  submitted_at timestamptz not null default now(),
  rejection_reason text,
  rejection_details text,
  failure_reason text,
  engagement    jsonb,
  audit         jsonb,
  locked_cpm   numeric check (locked_cpm is null or locked_cpm >= 0),
  locked_max_payout numeric check (locked_max_payout is null or locked_max_payout >= 0),
  constraint clips_user_id_not_null check (user_id is not null)
);

-- ---------------------------------------------------------------------------
-- clip_metrics — time-series snapshots of platform metrics for each clip.
-- Each row is an immutable snapshot captured at a point in time.
-- Only rows with verification_status = 'verified' may be used for earnings.
-- The client NEVER sets verified_views directly — only ingest_clip_metrics()
-- (server-only RPC) can promote a snapshot to verified.
-- ---------------------------------------------------------------------------
create table public.clip_metrics (
  id                uuid primary key default gen_random_uuid(),
  clip_id           uuid not null references public.clips (id) on delete cascade,
  campaign_id       uuid not null references public.campaigns (id) on delete cascade,
  platform          text not null,
  views             integer not null default 0 check (views >= 0),
  likes             integer not null default 0 check (likes >= 0),
  comments          integer not null default 0 check (comments >= 0),
  shares            integer not null default 0 check (shares >= 0),
  source            text not null default 'manual' check (source in ('platform_api','manual','mock','admin_override')),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','failed','disputed')),
  captured_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

alter table public.clip_metrics enable row level security;

-- Users can read their own metrics
drop policy if exists "clip_metrics_select" on public.clip_metrics;
create policy "clip_metrics_select" on public.clip_metrics
  for select using (
    exists (
      select 1 from public.clips c
      where c.id = clip_id and c.user_id = auth.uid()
    )
  );

-- Only service_role (backend) can insert metrics — no browser INSERT
drop policy if exists "clip_metrics_insert_service" on public.clip_metrics;
create policy "clip_metrics_insert_service" on public.clip_metrics
  for insert with check (public.is_admin());

-- Nobody can update metrics — they are immutable snapshots
drop policy if exists "clip_metrics_no_update" on public.clip_metrics;
create policy "clip_metrics_no_update" on public.clip_metrics
  for update using (false);

-- Nobody can delete metrics
drop policy if exists "clip_metrics_no_delete" on public.clip_metrics;
create policy "clip_metrics_no_delete" on public.clip_metrics
  for delete using (false);

-- ---------------------------------------------------------------------------
-- metrics_sync_jobs — tracks scheduled metric synchronization runs.
-- Each row represents one sync attempt for a clip or batch of clips.
-- ---------------------------------------------------------------------------
create table public.metrics_sync_jobs (
  id            uuid primary key default gen_random_uuid(),
  clip_id       uuid references public.clips (id) on delete cascade,
  campaign_id   uuid references public.campaigns (id) on delete cascade,
  platform      text not null,
  status        text not null default 'pending' check (status in ('pending','running','completed','failed')),
  metrics_captured integer default 0 check (metrics_captured >= 0),
  error         text,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.metrics_sync_jobs enable row level security;

-- Admins can read sync jobs
drop policy if exists "metrics_sync_jobs_select" on public.metrics_sync_jobs;
create policy "metrics_sync_jobs_select" on public.metrics_sync_jobs
  for select using (public.is_admin());

-- Only backend (service_role via admin) can insert/update sync jobs
drop policy if exists "metrics_sync_jobs_insert" on public.metrics_sync_jobs;
create policy "metrics_sync_jobs_insert" on public.metrics_sync_jobs
  for insert with check (public.is_admin());

drop policy if exists "metrics_sync_jobs_update" on public.metrics_sync_jobs;
create policy "metrics_sync_jobs_update" on public.metrics_sync_jobs
  for update using (public.is_admin());

-- ---------------------------------------------------------------------------
-- social_accounts — a clipper's connected publishing platforms.
-- SECURITY: this table stores ONLY non-secret metadata (handle, status, etc).
-- OAuth access tokens / client secrets / service-role keys MUST NEVER be stored
-- here or exposed to the browser. Real platform credentials belong in
-- social_connections (server-only, RLS forbids browser SELECT on token columns).
-- ---------------------------------------------------------------------------
drop table if exists public.social_connections cascade;
drop table if exists public.social_oauth_states cascade;
drop table if exists public.social_accounts cascade;

create table public.social_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) on delete cascade,
  platform            text not null,
  handle              text not null,
  provider_account_id text,
  avatar_url          text,
  status              text not null default 'not_connected' check (status in ('not_connected','connecting','connected','verified','connection_error','disconnected','verification_failed')),
  verified            boolean not null default false,
  connected_at        timestamptz,
  last_sync_at        timestamptz,
  error               text,
  created_at          timestamptz not null default now(),
  constraint social_accounts_user_platform_unique unique (user_id, platform)
);

alter table public.social_accounts enable row level security;

drop policy if exists "social_accounts_select" on public.social_accounts;
create policy "social_accounts_select" on public.social_accounts
  for select using (auth.uid() = user_id);

-- No INSERT policy: rows are created only by the server-side OAuth callback
-- (service_role). A browser INSERT could bypass OAuth verification entirely.
-- The DROP is kept so re-running this file removes any legacy policy.
drop policy if exists "social_accounts_insert" on public.social_accounts;

drop policy if exists "social_accounts_update" on public.social_accounts;
create policy "social_accounts_update" on public.social_accounts
  for update using (auth.uid() = user_id);

drop policy if exists "social_accounts_delete" on public.social_accounts;
create policy "social_accounts_delete" on public.social_accounts
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Trigger: enforce field-level permissions on social_accounts updates.
-- Non-admins cannot change trust fields (verified, provider_account_id, etc.).
-- Service-role (auth.uid() is NULL) skips the checks for the OAuth callback,
-- verify, and disconnect routes; admins are unrestricted.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_social_account_field_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role (auth.uid() is NULL) — trusted server operations, skip checks.
  -- These are server-side only and never reachable from the browser.
  if auth.uid() is null then
    return NEW;
  end if;

  -- Admins can change anything (skip checks)
  if public.is_admin() then
    return NEW;
  end if;

  -- Non-admins: block changes to trust fields
  if (OLD.verified IS DISTINCT FROM NEW.verified) then
    raise exception 'Only admins can change verified status';
  end if;
  if (OLD.provider_account_id IS DISTINCT FROM NEW.provider_account_id) then
    raise exception 'Only admins can change provider_account_id';
  end if;
  if (OLD.status IS DISTINCT FROM NEW.status) then
    raise exception 'Only admins can change connection status';
  end if;

  return NEW;
end;
$$;

drop trigger if exists enforce_social_account_fields on public.social_accounts;
create trigger enforce_social_account_fields
  before update on public.social_accounts
  for each row
  execute function public.enforce_social_account_field_permissions();

-- ---------------------------------------------------------------------------
-- social_connections — server-only encrypted token storage.
-- RLS: browser (anon/authenticated) CANNOT SELECT token columns.
-- Only service_role (backend jobs) can read tokens for API calls.
-- Tokens are AES-256-GCM encrypted before storage.
-- ---------------------------------------------------------------------------
create table public.social_connections (
  id               uuid primary key default gen_random_uuid(),
  social_account_id uuid references public.social_accounts (id) on delete cascade unique,
  user_id          uuid references auth.users (id) on delete cascade,
  platform         text not null,
  access_token_enc text,
  refresh_token_enc text,
  token_type       text default 'bearer',
  expires_at       timestamptz,
  scope            text,
  provider_meta    jsonb,
  verified_at      timestamptz,
  verification_data jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.social_connections enable row level security;

-- Browser CANNOT read token data — only service_role can
drop policy if exists "social_connections_no_browser_select" on public.social_connections;
create policy "social_connections_no_browser_select" on public.social_connections
  for select using (false);

-- NO INSERT policy: OAuth token rows are written exclusively by the server-side
-- OAuth callback (service_role). A browser INSERT could store attacker-chosen
-- tokens for a user_id it controls. DROPs are kept so re-running this file
-- removes any legacy policy (see security-hardening.sql §9).
drop policy if exists "social_connections_insert" on public.social_connections;

-- NO UPDATE policy: token columns are written only by the backend
-- (service_role) during token refresh. DROPs are kept so re-running this file
-- removes any legacy policy (see security-hardening.sql §9).
drop policy if exists "social_connections_update" on public.social_connections;

-- Users can delete their own connections
drop policy if exists "social_connections_delete" on public.social_connections;
create policy "social_connections_delete" on public.social_connections
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Trigger: second layer on top of RLS. Even if an UPDATE policy were ever
-- re-created, authenticated non-admins cannot modify backend-managed token
-- fields. Service-role (auth.uid() is NULL) and admins bypass the checks.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_social_connection_token_protection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role (auth.uid() is NULL) — trusted server operations, skip checks.
  -- The OAuth callback, disconnect, and metrics routes use service-role for
  -- trusted writes. These are server-side only and never reachable from the browser.
  if auth.uid() is null then
    return NEW;
  end if;

  -- Admins can change anything (skip checks)
  if public.is_admin() then
    return NEW;
  end if;

  -- Non-admins: block changes to backend-managed token fields.
  -- These columns are written exclusively by the backend via service_role.
  if (OLD.access_token_enc IS DISTINCT FROM NEW.access_token_enc) then
    raise exception 'Cannot modify access_token_enc directly';
  end if;
  if (OLD.refresh_token_enc IS DISTINCT FROM NEW.refresh_token_enc) then
    raise exception 'Cannot modify refresh_token_enc directly';
  end if;
  if (OLD.expires_at IS DISTINCT FROM NEW.expires_at) then
    raise exception 'Cannot modify expires_at directly';
  end if;
  if (OLD.scope IS DISTINCT FROM NEW.scope) then
    raise exception 'Cannot modify scope directly';
  end if;
  if (OLD.provider_meta IS DISTINCT FROM NEW.provider_meta) then
    raise exception 'Cannot modify provider_meta directly';
  end if;

  return NEW;
end;
$$;

drop trigger if exists enforce_social_connection_tokens on public.social_connections;
create trigger enforce_social_connection_tokens
  before update on public.social_connections
  for each row
  execute function public.enforce_social_connection_token_protection();

-- ---------------------------------------------------------------------------
-- social_oauth_states — temporary OAuth state parameters for CSRF protection.
-- Expires after 10 minutes. Cleaned up by backend.
-- ---------------------------------------------------------------------------
create table public.social_oauth_states (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete cascade,
  platform   text not null,
  state      text not null unique,
  code_verifier text,
  redirect_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Backend-only: NO policies at all. With RLS enabled and no policy, neither
-- anon nor authenticated can read, insert, or delete OAuth state rows —
-- the initiate/callback routes use service_role. This keeps the one-time-use
-- CSRF state (and its PKCE code_verifier) out of browser reach.
-- DROPs are kept so re-running this file removes any legacy policy.
alter table public.social_oauth_states enable row level security;

drop policy if exists "social_oauth_states_insert" on public.social_oauth_states;

drop policy if exists "social_oauth_states_delete" on public.social_oauth_states;

alter table public.campaigns enable row level security;
alter table public.clips enable row level security;

drop policy if exists "campaigns_select" on public.campaigns;
create policy "campaigns_select" on public.campaigns for select using (true);

drop policy if exists "campaigns_insert" on public.campaigns;
create policy "campaigns_insert" on public.campaigns for insert with check (auth.uid() = created_by);

drop policy if exists "campaigns_update" on public.campaigns;
create policy "campaigns_update" on public.campaigns for update using (auth.uid() = created_by or public.is_admin());

drop policy if exists "campaigns_delete" on public.campaigns;
create policy "campaigns_delete" on public.campaigns for delete using (auth.uid() = created_by or public.is_admin());

drop policy if exists "clips_select" on public.clips;
create policy "clips_select" on public.clips for select using (true);

drop policy if exists "clips_insert" on public.clips;
create policy "clips_insert" on public.clips for insert with check (auth.uid() = user_id);

-- UPDATE: only admins can update clips (status, views, financial fields)
-- Clippers cannot update any fields after submission
drop policy if exists "clips_update" on public.clips;
create policy "clips_update" on public.clips for update using (public.is_admin());

-- DELETE: only admins can delete clips
drop policy if exists "clips_delete" on public.clips;
create policy "clips_delete" on public.clips for delete using (public.is_admin());
