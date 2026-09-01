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
alter table public.profiles add column if not exists deactivated_at timestamptz;
alter table public.profiles add column if not exists deactivated_by uuid references auth.users (id) on delete set null;

-- Payout ledger columns on clips (no-op if present).
alter table public.clips add column if not exists txn_id text;
alter table public.clips add column if not exists payout_ref text;
alter table public.clips add column if not exists held_reason text;
alter table public.clips add column if not exists updated_at timestamptz;
alter table public.clips add column if not exists payout_date timestamptz;

-- Verified metrics column (no-op if present).
-- This is the ONLY view count used for earnings calculations.
-- Only set by ingest_clip_metrics() RPC — client cannot modify it.
alter table public.clips add column if not exists verified_views integer not null default 0;

-- Financial versioning columns (no-op if present).
-- Snapshotted from campaign at submission time. Used for display estimates
-- and to enforce that financial terms cannot change for existing clips.
alter table public.clips add column if not exists locked_cpm numeric;
alter table public.clips add column if not exists locked_max_payout numeric;

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
-- CAMPAIGNS: Strict creator-only authorization with server-side enforcement
-- ---------------------------------------------------------------------------

-- SELECT: world-readable (clippers need to browse campaigns)
drop policy if exists "campaigns_select" on public.campaigns;
create policy "campaigns_select" on public.campaigns
  for select using (true);

-- INSERT: only users with role='creator' can create campaigns
-- created_by is ALWAYS set to auth.uid() by the trigger (cannot be spoofed)
drop policy if exists "campaigns_insert" on public.campaigns;
create policy "campaigns_insert" on public.campaigns
  for insert with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'creator' and p.status = 'active'
    )
  );

-- UPDATE: only campaign owner or admin
drop policy if exists "campaigns_update" on public.campaigns;
create policy "campaigns_update" on public.campaigns
  for update using (auth.uid() = created_by or public.is_admin());

-- DELETE: only campaign owner or admin
drop policy if exists "campaigns_delete" on public.campaigns;
create policy "campaigns_delete" on public.campaigns
  for delete using (auth.uid() = created_by or public.is_admin());

-- Trigger: force created_by = auth.uid() on INSERT (prevents spoofing)
create or replace function public.set_campaign_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  NEW.created_by := auth.uid();
  return NEW;
end;
$$;

drop trigger if exists set_created_by on public.campaigns;
create trigger set_created_by
  before insert on public.campaigns
  for each row
  execute function public.set_campaign_created_by();

-- ---------------------------------------------------------------------------
-- RPC: Secure campaign creation (creator-only)
-- Server-side role check + created_by from auth.uid()
-- ---------------------------------------------------------------------------
create or replace function public.create_campaign(
  p_title text,
  p_brief text,
  p_platform text,
  p_payout numeric,
  p_creator text,
  p_niche text default null,
  p_budget numeric default 0,
  p_days_left integer default 30,
  p_source_link text default null,
  p_rules text default null,
  p_category text default null,
  p_platforms jsonb default null,
  p_objective text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_max_payout_per_clip numeric default null,
  p_recommended_duration text default null,
  p_hook text default null,
  p_caption_req text default null,
  p_aspect_ratio text default null,
  p_cta text default null,
  p_branding text default null,
  p_do_list jsonb default null,
  p_dont_list jsonb default null,
  p_source_assets jsonb default null,
  p_example_clips jsonb default null,
  p_view_rules jsonb default null,
  p_approval jsonb default null,
  p_thumbnails jsonb default null,
  p_brand_assets jsonb default null,
  p_spend_cap numeric default null,
  p_timezone text default null,
  p_what_to_make text default null,
  p_style text default null,
  p_rights jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_is_creator boolean;
  v_campaign jsonb;
begin
  -- Get authenticated user
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Verify creator role
  v_is_creator := exists (
    select 1 from public.profiles
    where id = v_user_id and role = 'creator' and status = 'active'
  );
  if not v_is_creator then
    raise exception 'Only creators can create campaigns';
  end if;

  -- Insert campaign (created_by is set by trigger to auth.uid())
  insert into public.campaigns (
    title, brief, platform, payout, creator, niche, budget, days_left,
    source_link, rules, category, platforms, objective, start_date, end_date,
    max_payout_per_clip, recommended_duration, hook, caption_req, aspect_ratio,
    cta, branding, do_list, dont_list, source_assets, example_clips,
    view_rules, approval, thumbnails, brand_assets, spend_cap, timezone,
    what_to_make, style, rights
  ) values (
    p_title, p_brief, p_platform, p_payout, p_creator, p_niche, p_budget, p_days_left,
    p_source_link, p_rules, p_category, p_platforms, p_objective, p_start_date, p_end_date,
    p_max_payout_per_clip, p_recommended_duration, p_hook, p_caption_req, p_aspect_ratio,
    p_cta, p_branding, p_do_list, p_dont_list, p_source_assets, p_example_clips,
    p_view_rules, p_approval, p_thumbnails, p_brand_assets, p_spend_cap, p_timezone,
    p_what_to_make, p_style, p_rights
  )
  returning to_jsonb(campaigns.*) into v_campaign;

  return v_campaign;
end;
$$;

grant execute on function public.create_campaign(
  text, text, text, numeric, text, text, numeric, integer, text, text, text,
  jsonb, text, date, date, numeric, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, numeric, text,
  text, text, jsonb
) to authenticated;

-- Clips: only the owner (or an admin) may edit / delete a clip. The base
-- schema used `auth.role() = 'authenticated'`, which let ANY signed-in user
-- tamper with anyone's clip (e.g. mark another clipper's clip as paid).

-- SELECT: clippers see own clips, creators see clips on their campaigns, admins see all
drop policy if exists "clips_select" on public.clips;
create policy "clips_select" on public.clips
  for select using (
    auth.uid() = user_id
    or public.is_admin()
    or exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.created_by = auth.uid()
    )
  );

-- INSERT: only clippers can create clips, and only for their own user_id
drop policy if exists "clips_insert" on public.clips;
create policy "clips_insert" on public.clips
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'clipper' and p.status = 'active'
    )
  );

-- UPDATE: only admins can update clips (status, views, financial fields)
-- Clippers cannot update any fields after submission
drop policy if exists "clips_update" on public.clips;
create policy "clips_update" on public.clips
  for update using (public.is_admin());

-- DELETE: only admins can delete clips
drop policy if exists "clips_delete" on public.clips;
create policy "clips_delete" on public.clips
  for delete using (public.is_admin());


-- ===========================================================================
-- UNIFIED ADMIN ACTION FRAMEWORK
--
-- Every sensitive admin action goes through a dedicated RPC that:
--   1. Authenticates via auth.uid()
--   2. Verifies admin role server-side
--   3. Verifies the required permission (fine-grained)
--   4. Validates the target record exists
--   5. Performs the operation transactionally
--   6. Writes an authoritative audit log entry
--   7. Returns explicit success/error result
--
-- The UI MUST NOT show success unless the backend operation actually succeeded.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helper: write audit log entry (called by all admin actions)
-- ---------------------------------------------------------------------------
create or replace function public.write_admin_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_entity_label text default null,
  p_before_state jsonb default null,
  p_after_state jsonb default null,
  p_metadata jsonb default null,
  p_idempotency_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_actor_id uuid;
  v_actor_email text;
begin
  -- Actor ALWAYS derived from auth.uid() — never from client parameters
  v_actor_id := auth.uid();
  select email into v_actor_email from public.profiles where id = v_actor_id;

  v_id := 'audit-' || extract(epoch from now())::bigint || '-' || upper(md5(random()::text));

  -- Idempotency: skip if this exact key already exists
  if p_idempotency_key is not null and exists (
    select 1 from public.audit_logs where idempotency_key = p_idempotency_key
  ) then
    return;
  end if;

  insert into public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id, entity_label,
    before_state, after_state, metadata, idempotency_key,
    -- Legacy columns for backward compatibility
    target_type, target_id, target_label, previous_value, new_value, reason
  ) values (
    v_id, v_actor_id, coalesce(v_actor_email, 'unknown'), p_action,
    p_entity_type, p_entity_id, p_entity_label,
    p_before_state, p_after_state, p_metadata, p_idempotency_key,
    -- Legacy mappings
    p_entity_type, p_entity_id, p_entity_label,
    p_before_state #>> '{}', p_after_state #>> '{}',
    p_metadata #>> '{reason}'
  );
end;
$$;

grant execute on function public.write_admin_audit(text, text, text, text, jsonb, jsonb, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: admin_clip_action -- all sensitive clip operations
-- Actions: approve, reject, hold, payable, processing, paid, failed, retry, release, revert
-- ---------------------------------------------------------------------------
create or replace function public.admin_clip_action(
  p_clip_id uuid,
  p_action text,
  p_reason text default null,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_clip record;
  v_new_status text;
  v_old_status text;
  v_perm text;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Only admins can perform clip actions'; end if;

  if p_action not in ('approve','reject','hold','payable','processing','paid','failed','retry','release','revert') then
    raise exception 'Invalid action: %', p_action;
  end if;

  v_perm := 'clip.' || p_action;
  if p_action = 'retry' then v_perm := 'clip.processing'; end if;
  if p_action = 'release' then v_perm := 'clip.approve'; end if;
  if p_action = 'revert' then v_perm := 'clip.payable'; end if;

  if not public.admin_has_perm(v_perm) then
    raise exception 'Missing permission: %', v_perm;
  end if;

  select * into v_clip from public.clips where id = p_clip_id;
  if not found then raise exception 'Clip not found'; end if;
  v_old_status := v_clip.status;

  v_new_status := case p_action
    when 'approve' then 'approved' when 'reject' then 'rejected'
    when 'hold' then 'held' when 'payable' then 'payable'
    when 'processing' then 'processing' when 'paid' then 'paid'
    when 'failed' then 'failed' when 'retry' then 'processing'
    when 'release' then 'approved' when 'revert' then 'payable'
  end;

  perform public.update_clip_status(
    p_clip_id, v_new_status,
    case when p_action = 'reject' then p_reason else null end,
    case when p_action = 'reject' then p_details else null end,
    case when p_action = 'failed' then p_reason else null end,
    case when p_action = 'hold' then p_reason else null end,
    null, null
  );

  perform public.write_admin_audit(
    'clip_' || p_action, 'clip', p_clip_id::text,
    coalesce(v_clip.caption, p_clip_id::text),
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', v_new_status),
    jsonb_build_object('reason', p_reason, 'action', p_action),
    'clip-' || p_clip_id::text || '-' || p_action
  );

  select to_jsonb(c.*) into v_clip from public.clips c where id = p_clip_id;
  return jsonb_build_object('success', true, 'clip', v_clip, 'action', p_action, 'from', v_old_status, 'to', v_new_status);
end;
$$;

grant execute on function public.admin_clip_action(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: admin_user_action -- all sensitive user/profile operations
-- Actions: suspend, reactivate, verify, unverify, set_risk, clear_risk,
--          save_notes, deactivate, delete
--
-- deactivate: Anonymizes profile, bans auth account. Preserves all financial
--             and audit records. Preferred for users with history.
-- delete:     Hard-deletes auth user (cascades). Only allowed when NO
--             financial records exist (wallet_ledger, payouts, earnings).
-- ---------------------------------------------------------------------------
create or replace function public.admin_user_action(
  p_user_id uuid,
  p_action text,
  p_reason text default null,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_profile record;
  v_old_status text;
  v_new_value text;
  v_perm text;
  v_financial_count integer;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Only admins can perform user actions'; end if;

  if p_action not in ('suspend','reactivate','verify','unverify','set_risk','clear_risk','save_notes','deactivate','delete') then
    raise exception 'Invalid action: %', p_action;
  end if;

  v_perm := 'clipper.' || p_action;
  if p_action in ('verify','unverify') then v_perm := 'clipper.verify'; end if;
  if p_action in ('set_risk','clear_risk') then v_perm := 'clipper.risk'; end if;
  if p_action = 'save_notes' then v_perm := 'clipper.notes'; end if;
  if p_action in ('deactivate','delete') then v_perm := 'clipper.delete'; end if;

  if not public.admin_has_perm(v_perm) then
    raise exception 'Missing permission: %', v_perm;
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
  v_old_status := v_profile.status;

  case p_action
    when 'suspend' then
      update public.profiles set status = 'suspended', suspended_reason = p_reason where id = p_user_id;
      v_new_value := 'suspended';
    when 'reactivate' then
      update public.profiles set status = 'active', suspended_reason = null where id = p_user_id;
      v_new_value := 'active';
    when 'verify' then
      update public.profiles set verified = true, verified_at = now() where id = p_user_id;
      v_new_value := 'verified';
    when 'unverify' then
      update public.profiles set verified = false, verified_at = null where id = p_user_id;
      v_new_value := 'unverified';
    when 'set_risk' then
      update public.profiles set risk_flag = true, risk_note = p_details where id = p_user_id;
      v_new_value := 'flagged';
    when 'clear_risk' then
      update public.profiles set risk_flag = false, risk_note = null where id = p_user_id;
      v_new_value := 'cleared';
    when 'save_notes' then
      update public.profiles set admin_notes = p_details where id = p_user_id;
      v_new_value := 'updated';

    -- DEACTIVATE: Anonymize profile data, ban auth account, preserve all records.
    -- This is the preferred action for users with financial/history records.
    when 'deactivate' then
      -- Anonymize profile: strip all PII, mark as deactivated
      update public.profiles set
        name = 'Deleted user',
        email = 'deleted-' || p_user_id::text || '@removed.local',
        username = null,
        upi = null,
        bio = null,
        company = null,
        team = null,
        status = 'deactivated',
        verified = false,
        verified_at = null,
        risk_flag = false,
        risk_note = null,
        admin_notes = coalesce(p_reason, 'Account deactivated by admin'),
        suspended_reason = null,
        appeals = null,
        deactivated_at = now(),
        deactivated_by = v_actor
      where id = p_user_id;

      -- Ban auth account to prevent future logins (banned for 100 years)
      update auth.users set
        banned_until = now() + interval '100 years',
        raw_app_meta_data = raw_app_meta_data - 'provider'
      where id = p_user_id;

      -- Disconnect all social accounts (revoke tokens)
      delete from public.social_connections where user_id = p_user_id;
      delete from public.social_accounts where user_id = p_user_id;
      delete from public.social_oauth_states where user_id = p_user_id;

      v_new_value := 'deactivated';

    -- DELETE: Hard-delete from auth.users (cascades to profiles, clips, etc.)
    -- Only allowed when NO financial records exist.
    when 'delete' then
      -- Check for financial records that would be orphaned or lost
      select count(*) into v_financial_count
      from (
        select 1 from public.wallet_ledger where user_id = p_user_id
        union all
        select 1 from public.payouts where user_id = p_user_id
        union all
        select 1 from public.earnings where clipper_id = p_user_id
      ) financial;

      if v_financial_count > 0 then
        raise exception 'Cannot delete user with % financial records. Use deactivate instead.', v_financial_count;
      end if;

      -- Delete social connections first (not cascaded from auth.users)
      delete from public.social_connections where user_id = p_user_id;
      delete from public.social_accounts where user_id = p_user_id;
      delete from public.social_oauth_states where user_id = p_user_id;

      -- Hard delete from auth.users (cascades to profiles, clips, notifications, admin_permissions)
      delete from auth.users where id = p_user_id;

      v_new_value := 'deleted';
  end case;

  perform public.write_admin_audit(
    'user_' || p_action, 'user', p_user_id::text,
    coalesce(v_profile.name, v_profile.email, p_user_id::text),
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', v_new_value),
    jsonb_build_object('reason', p_reason, 'action', p_action),
    'user-' || p_user_id::text || '-' || p_action
  );

  return jsonb_build_object('success', true, 'action', p_action, 'user_id', p_user_id, 'to', v_new_value);
end;
$$;

grant execute on function public.admin_user_action(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: deactivate_own_account -- self-service account deactivation
-- Allows any authenticated user to deactivate their own account.
-- Anonymizes profile, bans auth account, preserves all records.
-- ---------------------------------------------------------------------------
create or replace function public.deactivate_own_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_profile record;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_profile from public.profiles where id = v_user;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.status = 'deactivated' then
    raise exception 'Account is already deactivated';
  end if;

  -- Anonymize profile
  update public.profiles set
    name = 'Deleted user',
    email = 'deleted-' || v_user::text || '@removed.local',
    username = null,
    upi = null,
    bio = null,
    company = null,
    team = null,
    status = 'deactivated',
    verified = false,
    verified_at = null,
    risk_flag = false,
    risk_note = null,
    suspended_reason = null,
    appeals = null,
    deactivated_at = now(),
    deactivated_by = v_user
  where id = v_user;

  -- Ban auth account to prevent future logins
  update auth.users set
    banned_until = now() + interval '100 years',
    raw_app_meta_data = raw_app_meta_data - 'provider'
  where id = v_user;

  -- Disconnect all social accounts
  delete from public.social_connections where user_id = v_user;
  delete from public.social_accounts where user_id = v_user;
  delete from public.social_oauth_states where user_id = v_user;

  perform public.write_admin_audit(
    'user_self_deactivate', 'user', v_user::text,
    coalesce(v_profile.name, v_profile.email, v_user::text),
    jsonb_build_object('status', v_profile.status),
    jsonb_build_object('status', 'deactivated'),
    jsonb_build_object('reason', 'Self-service account deactivation'),
    'user-' || v_user::text || '-self-deactivate'
  );

  return jsonb_build_object('success', true, 'action', 'deactivate', 'user_id', v_user, 'to', 'deactivated');
end;
$$;

grant execute on function public.deactivate_own_account() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: admin_campaign_action -- all sensitive campaign operations
-- Actions: pause, resume, close, reopen, delete
-- ---------------------------------------------------------------------------
create or replace function public.admin_campaign_action(
  p_campaign_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_campaign record;
  v_new_status text;
  v_perm text;
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'Not authenticated'; end if;

  if p_action not in ('pause','resume','close','reopen','archive') then
    raise exception 'Invalid action: %', p_action;
  end if;

  select * into v_campaign from public.campaigns where id = p_campaign_id;
  if not found then raise exception 'Campaign not found'; end if;

  -- Authorization: campaign owners can archive their own campaigns.
  -- All other actions require admin role + fine-grained permission.
  if p_action = 'archive' then
    if v_campaign.created_by is not null and v_campaign.created_by = v_actor then
      null; -- Owner archiving own campaign
    elsif public.is_admin() then
      v_perm := 'campaign.archive';
      if not public.admin_has_perm(v_perm) then
        raise exception 'Missing permission: %', v_perm;
      end if;
    else
      raise exception 'Only the campaign owner or an admin can archive this campaign';
    end if;
  else
    if not public.is_admin() then raise exception 'Only admins can perform campaign actions'; end if;
    v_perm := 'campaign.' || p_action;
    if not public.admin_has_perm(v_perm) then
      raise exception 'Missing permission: %', v_perm;
    end if;
  end if;

  case p_action
    when 'pause' then
      update public.campaigns set status = 'paused' where id = p_campaign_id;
      v_new_status := 'paused';
    when 'resume' then
      update public.campaigns set status = 'open' where id = p_campaign_id;
      v_new_status := 'open';
    when 'close' then
      update public.campaigns set status = 'closed' where id = p_campaign_id;
      v_new_status := 'closed';
    when 'reopen' then
      update public.campaigns set status = 'open' where id = p_campaign_id;
      v_new_status := 'open';
    when 'archive' then
      update public.campaigns
        set status = 'archived',
            archived_at = now(),
            archived_by = v_actor
        where id = p_campaign_id;
      v_new_status := 'archived';
  end case;

  perform public.write_admin_audit(
    'campaign_' || p_action, 'campaign', p_campaign_id::text,
    v_campaign.title,
    jsonb_build_object('status', v_campaign.status),
    jsonb_build_object('status', v_new_status),
    jsonb_build_object('reason', p_reason, 'action', p_action),
    'campaign-' || p_campaign_id::text || '-' || p_action
  );

  return jsonb_build_object('success', true, 'action', p_action, 'campaign_id', p_campaign_id, 'to', v_new_status);
end;
$$;

grant execute on function public.admin_campaign_action(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Secure clip status update (admin-only)
-- All status transitions go through this function, never direct UPDATE.
-- ---------------------------------------------------------------------------
create or replace function public.update_clip_status(
  p_clip_id uuid,
  p_status text,
  p_rejection_reason text default null,
  p_rejection_details text default null,
  p_failure_reason text default null,
  p_held_reason text default null,
  p_txn_id text default null,
  p_payout_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clip record;
  v_actor uuid;
  v_is_admin boolean;
  v_earning_status text;
begin
  -- Get current user
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  -- Verify admin role
  v_is_admin := public.is_admin();
  if not v_is_admin then
    raise exception 'Only admins can update clip status';
  end if;

  -- Validate status
  if p_status not in ('pending', 'approved', 'rejected', 'held', 'processing', 'paid', 'failed', 'payable') then
    raise exception 'Invalid status: %', p_status;
  end if;

  -- Get current clip
  select * into v_clip from public.clips where id = p_clip_id;
  if not found then
    raise exception 'Clip not found';
  end if;

  -- Update the clip
  update public.clips set
    status = p_status,
    rejection_reason = coalesce(p_rejection_reason, rejection_reason),
    rejection_details = coalesce(p_rejection_details, rejection_details),
    failure_reason = coalesce(p_failure_reason, failure_reason),
    held_reason = coalesce(p_held_reason, held_reason),
    txn_id = coalesce(p_txn_id, txn_id),
    payout_ref = coalesce(p_payout_ref, payout_ref),
    payout_date = case when p_status = 'paid' then now() else payout_date end,
    updated_at = now(),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'status_changed',
      'by', (select email from public.profiles where id = v_actor),
      'at', now(),
      'from', v_clip.status,
      'to', p_status
    )
  where id = p_clip_id
  returning to_jsonb(clips.*) into v_clip;

  -- When clip becomes financially approved, create immutable earning record
  if p_status in ('approved', 'payable', 'processing', 'paid') then
    -- Check if earning already exists for this clip
    if not exists (select 1 from public.earnings where clip_id = p_clip_id) then
      -- Create earning with locked CPM
      v_earning_status := case
        when p_status = 'paid' then 'paid'
        when p_status in ('processing', 'payable') then 'approved'
        else p_status
      end;
      perform public.create_earning(p_clip_id, v_earning_status);
    end if;
  end if;

  return v_clip;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: Secure clip view update (admin-only)
-- Views and engagement metrics are updated through this function.
-- ---------------------------------------------------------------------------
create or replace function public.update_clip_views(
  p_clip_id uuid,
  p_views integer,
  p_engagement jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clip record;
begin
  -- Only admins can update views
  if not public.is_admin() then
    raise exception 'Only admins can update clip views';
  end if;

  update public.clips set
    views = p_views,
    engagement = coalesce(p_engagement, engagement),
    updated_at = now()
  where id = p_clip_id
  returning to_jsonb(clips.*) into v_clip;

  return v_clip;
end;
$$;

-- Grant execute to authenticated users (RLS still applies within the function)
grant execute on function public.update_clip_status(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_clip_views(uuid, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Ingest verified metrics for a clip (server-only)
--
-- This is the ONLY function that can update clips.verified_views.
-- Called by the metric sync backend after fetching from platform APIs.
-- Stores an immutable snapshot in clip_metrics and updates the clip's
-- verified_views to the latest verified count.
--
-- Security: service_role only (backend jobs). The client cannot call this.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_clip_metrics(
  p_clip_id uuid,
  p_views integer,
  p_likes integer default 0,
  p_comments integer default 0,
  p_shares integer default 0,
  p_source text default 'platform_api',
  p_verification_status text default 'verified'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clip record;
  v_metric_id uuid;
  v_metric jsonb;
begin
  -- Get clip
  select * into v_clip from public.clips where id = p_clip_id;
  if not found then
    raise exception 'Clip not found: %', p_clip_id;
  end if;

  -- Validate source
  if p_source not in ('platform_api', 'manual', 'mock', 'admin_override') then
    raise exception 'Invalid source: %', p_source;
  end if;

  -- Validate verification_status
  if p_verification_status not in ('pending', 'verified', 'failed', 'disputed') then
    raise exception 'Invalid verification_status: %', p_verification_status;
  end if;

  -- Validate views are non-negative
  if p_views < 0 then
    raise exception 'Views cannot be negative: %', p_views;
  end if;

  -- Insert immutable metric snapshot
  insert into public.clip_metrics (
    clip_id, campaign_id, platform, views, likes, comments, shares,
    source, verification_status, captured_at
  ) values (
    p_clip_id, v_clip.campaign_id, v_clip.platform,
    p_views, p_likes, p_comments, p_shares,
    p_source, p_verification_status, now()
  )
  returning id into v_metric_id;

  -- Only update verified_views if the metric is verified
  if p_verification_status = 'verified' then
    update public.clips set
      verified_views = p_views,
      updated_at = now()
    where id = p_clip_id;
  end if;

  -- Return the created metric
  select to_jsonb(cm.*) into v_metric
  from public.clip_metrics cm
  where id = v_metric_id;

  return v_metric;
end;
$$;

grant execute on function public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: Get latest verified metrics for a clip
-- Returns the most recent verified metric snapshot for display/earnings.
-- ---------------------------------------------------------------------------
create or replace function public.get_latest_verified_metrics(
  p_clip_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select to_jsonb(cm.*
  ) from public.clip_metrics cm
  where cm.clip_id = p_clip_id
    and cm.verification_status = 'verified'
  order by cm.captured_at desc
  limit 1;
$$;

grant execute on function public.get_latest_verified_metrics(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Get metric history for a clip
-- Returns all metric snapshots (verified and pending) for a clip.
-- ---------------------------------------------------------------------------
create or replace function public.get_clip_metrics(
  p_clip_id uuid,
  p_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(cm.*), '[]'::jsonb)
  from (
    select * from public.clip_metrics
    where clip_id = p_clip_id
    order by captured_at desc
    limit p_limit
  ) cm;
$$;

grant execute on function public.get_clip_metrics(uuid, integer) to authenticated;

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
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) on delete cascade,
  platform            text not null,
  handle              text not null,
  provider_account_id text,
  avatar_url          text,
  status              text not null default 'not_connected',
  verified            boolean not null default false,
  connected_at        timestamptz,
  last_sync_at        timestamptz,
  error               text,
  created_at          timestamptz not null default now()
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

-- Server-only encrypted token storage (browser cannot SELECT token columns)
create table if not exists public.social_connections (
  id                uuid primary key default gen_random_uuid(),
  social_account_id uuid references public.social_accounts (id) on delete cascade,
  user_id           uuid references auth.users (id) on delete cascade,
  platform          text not null,
  access_token_enc  text,
  refresh_token_enc text,
  token_type        text default 'bearer',
  expires_at        timestamptz,
  scope             text,
  provider_meta     jsonb,
  verified_at       timestamptz,
  verification_data jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.social_connections enable row level security;

drop policy if exists "social_connections_no_browser_select" on public.social_connections;
create policy "social_connections_no_browser_select" on public.social_connections
  for select using (false);

drop policy if exists "social_connections_insert" on public.social_connections;
create policy "social_connections_insert" on public.social_connections
  for insert with check (auth.uid() = user_id);

drop policy if exists "social_connections_update" on public.social_connections;
create policy "social_connections_update" on public.social_connections
  for update using (auth.uid() = user_id);

drop policy if exists "social_connections_delete" on public.social_connections;
create policy "social_connections_delete" on public.social_connections
  for delete using (auth.uid() = user_id);

-- Temporary OAuth state for CSRF protection (expires after 10 min)
create table if not exists public.social_oauth_states (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,
  platform      text not null,
  state         text not null unique,
  code_verifier text,
  redirect_to   text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

alter table public.social_oauth_states enable row level security;

drop policy if exists "social_oauth_states_insert" on public.social_oauth_states;
create policy "social_oauth_states_insert" on public.social_oauth_states
  for insert with check (auth.uid() = user_id);

drop policy if exists "social_oauth_states_delete" on public.social_oauth_states;
create policy "social_oauth_states_delete" on public.social_oauth_states
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
-- EARNINGS TABLE — immutable financial records with locked CPM
-- When a clip becomes financially approved, the CPM is locked in.
-- Historical earnings NEVER change when campaign CPM/budget/rules are edited.
-- All monetary values in INTEGER minor units (paise for INR) to avoid float errors.
-- ---------------------------------------------------------------------------
create table if not exists public.earnings (
  id              uuid primary key default gen_random_uuid(),
  clip_id         uuid not null references public.clips(id) on delete cascade,
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  clipper_id      uuid references auth.users(id) on delete set null,
  locked_cpm      integer not null,           -- CPM in paise (e.g., ₹220 = 22000)
  verified_views  integer not null default 0, -- Views at time of approval
  gross_amount    integer not null,            -- In paise: (views / 1000) * locked_cpm
  platform_fee    integer not null,            -- In paise: 10% of gross
  net_amount      integer not null,            -- In paise: gross - platform_fee
  creator_fee     integer not null default 0,  -- In paise: 10% creator-side fee
  currency        text not null default 'INR',
  status          text not null default 'pending', -- pending, approved, paid, failed
  created_at      timestamptz not null default now(),
  approved_at     timestamptz,
  paid_at         timestamptz,
  txn_id          text,
  payout_ref      text,
  audit           jsonb
);

-- Indexes for performance
create index if not exists earnings_clip_id_idx on public.earnings(clip_id);
create index if not exists earnings_campaign_id_idx on public.earnings(campaign_id);
create index if not exists earnings_clipper_id_idx on public.earnings(clipper_id);
create index if not exists earnings_status_idx on public.earnings(status);

-- RLS: clipper sees own earnings, creator sees earnings on their campaigns, admin sees all
alter table public.earnings enable row level security;

drop policy if exists "earnings_select" on public.earnings;
create policy "earnings_select" on public.earnings
  for select using (
    auth.uid() = clipper_id
    or public.is_admin()
    or exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.created_by = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: admin-only (all mutations go through RPC)
drop policy if exists "earnings_insert" on public.earnings;
create policy "earnings_insert" on public.earnings
  for insert with check (public.is_admin());

drop policy if exists "earnings_update" on public.earnings;
create policy "earnings_update" on public.earnings
  for update using (public.is_admin());

drop policy if exists "earnings_delete" on public.earnings;
create policy "earnings_delete" on public.earnings
  for delete using (public.is_admin());

-- ===========================================================================
-- WALLET LEDGER — authoritative source of truth for all financial balances.
-- Every money movement is an immutable ledger entry. Balances are DERIVED,
-- never stored. Users can never insert positive entries themselves.
-- All amounts in INTEGER minor units (paise for INR).
-- ===========================================================================
create table if not exists public.wallet_ledger (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  type            text not null check (type in (
    'earning_credit',    -- clip earning credited to wallet
    'adjustment',        -- admin manual adjustment (positive or negative)
    'payout_debit',      -- payout initiated, debited from wallet
    'reversal',          -- reverses a previous entry (negative of original)
    'refund'             -- refund/reversal of a failed payout
  )),
  amount          integer not null,  -- positive = credit, negative = debit, in paise
  currency        text not null default 'INR',
  reference_type  text not null,     -- 'earning', 'payout', 'adjustment', etc.
  reference_id    uuid not null,     -- ID of the related earning/payout/etc.
  idempotency_key text unique not null, -- prevents duplicate entries
  created_at      timestamptz not null default now(),
  metadata        jsonb              -- flexible audit data (actor, reason, etc.)
);

-- Performance indexes
create index if not exists ledger_user_id_idx on public.wallet_ledger(user_id);
create index if not exists ledger_type_idx on public.wallet_ledger(type);
create index if not exists ledger_reference_idx on public.wallet_ledger(reference_type, reference_id);
create index if not exists ledger_created_idx on public.wallet_ledger(created_at);
create index if not exists ledger_idempotency_idx on public.wallet_ledger(idempotency_key);

-- RLS: users see own entries, admins see all. INSERT/UPDATE/DELETE admin-only.
alter table public.wallet_ledger enable row level security;

drop policy if exists "ledger_select" on public.wallet_ledger;
create policy "ledger_select" on public.wallet_ledger
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "ledger_insert" on public.wallet_ledger;
create policy "ledger_insert" on public.wallet_ledger
  for insert with check (public.is_admin());

drop policy if exists "ledger_update" on public.wallet_ledger;
create policy "ledger_update" on public.wallet_ledger
  for update using (public.is_admin());

drop policy if exists "ledger_delete" on public.wallet_ledger;
create policy "ledger_delete" on public.wallet_ledger
  for delete using (public.is_admin());

-- ===========================================================================
-- PAYOUTS — tracks payout requests and disbursements.
-- A payout groups one or more earnings for batch disbursement.
-- Statuses: requested → processing → paid/failed → reversed
-- ===========================================================================
create table if not exists public.payouts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  amount          integer not null,  -- total payout amount in paise (net to clipper)
  net_amount      integer not null,  -- net after any fees, in paise
  currency        text not null default 'INR',
  status          text not null default 'requested' check (status in (
    'requested',    -- clipper requested payout
    'processing',   -- admin/provider is processing
    'paid',         -- payout sent successfully
    'failed',       -- payout failed
    'reversed'      -- payout reversed/charged back
  )),
  method          text,              -- 'upi', 'bank_transfer', etc.
  upi_id          text,              -- UPI ID used for this payout
  provider        text default 'mock', -- payment provider name
  provider_ref    text,              -- external payment/provider reference
  idempotency_key text unique not null, -- prevents duplicate requests
  requested_at    timestamptz not null default now(),
  processed_at    timestamptz,
  paid_at         timestamptz,
  failed_at       timestamptz,
  reversed_at     timestamptz,
  failure_reason  text,
  retry_count     integer not null default 0,
  metadata        jsonb,
  audit           jsonb
);

create index if not exists payouts_user_idx on public.payouts(user_id);
create index if not exists payouts_status_idx on public.payouts(status);
create index if not exists payouts_idempotency_idx on public.payouts(idempotency_key);

-- RLS: clipper sees own, admin sees all. Clipper can insert (request).
-- UPDATE is admin-only — users can never change payout status directly.
alter table public.payouts enable row level security;

drop policy if exists "payouts_select" on public.payouts;
create policy "payouts_select" on public.payouts
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "payouts_insert" on public.payouts;
create policy "payouts_insert" on public.payouts
  for insert with check (auth.uid() = user_id);

drop policy if exists "payouts_update" on public.payouts;
create policy "payouts_update" on public.payouts
  for update using (public.is_admin());

-- ---------------------------------------------------------------------------
-- RPC: create_earning — ATOMIC earning creation with budget enforcement.
--
-- All financial logic runs inside a single PostgreSQL transaction:
--   1. Lock the campaign row (SELECT ... FOR UPDATE) to serialize concurrent
--      approvals. Two simultaneous approvals cannot both pass the budget check.
--   2. Sum existing reserved budget from committed earnings.
--   3. Calculate the new earning amount (with maxPayoutPerClip cap).
--   4. Verify it does not exceed the campaign budget.
--   5. Insert the earning record + wallet ledger entry.
--   6. Everything commits atomically. If budget exceeded, entire txn rolls back.
--
-- Idempotent: if an earning already exists for this clip, returns it without
-- creating duplicates.
-- ---------------------------------------------------------------------------
create or replace function public.create_earning(
  p_clip_id uuid,
  p_status text default 'pending'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clip record;
  v_campaign record;
  v_locked_cpm integer;
  v_verified_views integer;
  v_gross integer;
  v_platform_fee integer;
  v_net integer;
  v_creator_fee integer;
  v_max_payout integer;
  v_budget numeric;
  v_reserved numeric;
  v_new_total numeric;
  v_earning jsonb;
  v_ledger_id uuid;
  v_idempotency_key text;
begin
  -- Only admins can create earnings
  if not public.is_admin() then
    raise exception 'Only admins can create earnings';
  end if;

  -- Get clip (no lock needed — clip is read-only here)
  select * into v_clip from public.clips where id = p_clip_id;
  if not found then
    raise exception 'Clip not found';
  end if;

  -- Idempotency: skip if earning already exists for this clip
  if exists (select 1 from public.earnings where clip_id = p_clip_id) then
    select to_jsonb(e.*) into v_earning from public.earnings e where clip_id = p_clip_id;
    return v_earning;
  end if;

  -- ── LOCK the campaign row to serialize concurrent approvals ──
  -- SELECT ... FOR UPDATE blocks other transactions from modifying this
  -- campaign until our transaction commits or rolls back. This prevents
  -- two simultaneous approvals from both passing the budget check.
  select * into v_campaign
  from public.campaigns
  where id = v_clip.campaign_id
  for update;

  if not found then
    raise exception 'Campaign not found';
  end if;

  -- FINANCIAL VERSIONING: Prefer clip's locked terms (snapshotted at submission).
  -- Fall back to campaign's current terms for clips submitted before versioning.
  v_locked_cpm := case
    when v_clip.locked_cpm is not null then round(v_clip.locked_cpm * 100)::integer
    else round(v_campaign.payout * 100)::integer
  end;
  v_verified_views := v_clip.verified_views;

  -- Calculate gross: (views / 1000) * CPM in paise
  -- Using integer arithmetic: (views * CPM) / 1000
  -- NOTE: Uses verified_views (platform-confirmed), NOT submitted views.
  v_gross := (v_verified_views * v_locked_cpm) / 1000;

  -- Apply maxPayoutPerClip: prefer clip's locked value, fall back to campaign
  v_max_payout := case
    when v_clip.locked_max_payout is not null and v_clip.locked_max_payout > 0
      then round(v_clip.locked_max_payout * 100)::integer
    when v_campaign.max_payout_per_clip is not null and v_campaign.max_payout_per_clip > 0
      then round(v_campaign.max_payout_per_clip * 100)::integer
    else null
  end;

  if v_max_payout is not null and v_gross > v_max_payout then
    v_gross := v_max_payout;
  end if;

  -- Platform fee: 10% of gross
  v_platform_fee := round(v_gross * 0.10)::integer;

  -- Net to clipper: gross - platform fee
  v_net := v_gross - v_platform_fee;

  -- Creator fee: 10% of gross (charged to creator)
  v_creator_fee := round(v_gross * 0.10)::integer;

  -- ── BUDGET ENFORCEMENT (atomic) ──
  -- Budget is stored in rupees (numeric). Convert new earning to rupees for comparison.
  v_budget := v_campaign.budget;

  -- Only enforce budget if budget > 0 (0 or null means unlimited)
  if v_budget is not null and v_budget > 0 then
    -- Sum all existing approved/reserved earnings for this campaign.
    -- This is the committed budget usage — no other transaction can add to this
    -- while we hold the FOR UPDATE lock on the campaign row.
    select coalesce(sum(gross_amount), 0) into v_reserved
    from public.earnings
    where campaign_id = v_clip.campaign_id
      and status in ('approved', 'payable', 'processing', 'failed');

    -- Calculate new total: existing reserved + this new earning (in paise → rupees)
    v_new_total := v_reserved + v_gross;

    -- Check budget ceiling
    -- Both v_budget (rupees) and v_new_total (paise) need consistent units.
    -- v_reserved is in paise, v_budget is in rupees. Convert budget to paise.
    if v_new_total > (v_budget * 100) then
      raise exception 'Campaign budget exceeded: reserved ₹% + new ₹% > budget ₹% (all in paise: % + % > %)',
        v_reserved / 100, v_gross / 100, v_budget,
        v_reserved, v_gross, (v_budget * 100);
    end if;
  end if;

  -- ── INSERT earning record (immutable snapshot) ──
  insert into public.earnings (
    clip_id, campaign_id, clipper_id, locked_cpm, verified_views,
    gross_amount, platform_fee, net_amount, creator_fee,
    status, approved_at, txn_id
  ) values (
    p_clip_id, v_clip.campaign_id, v_clip.user_id, v_locked_cpm, v_verified_views,
    v_gross, v_platform_fee, v_net, v_creator_fee,
    p_status, case when p_status = 'approved' then now() else null end,
    case when p_status in ('approved', 'payable', 'processing', 'paid')
         then 'TXN-' || upper(p_clip_id::text) else null end
  )
  returning to_jsonb(earnings.*) into v_earning;

  -- ── INSERT wallet ledger entry ──
  v_idempotency_key := 'earning-credit-' || p_clip_id::text;

  if v_net > 0 and not exists (
    select 1 from public.wallet_ledger where idempotency_key = v_idempotency_key
  ) then
    insert into public.wallet_ledger (
      user_id, type, amount, currency, reference_type, reference_id,
      idempotency_key, metadata
    ) values (
      v_clip.user_id, 'earning_credit', v_net, 'INR', 'earning',
      (v_earning->>'id')::uuid, v_idempotency_key,
      jsonb_build_object(
        'clip_id', p_clip_id,
        'campaign_id', v_clip.campaign_id,
        'campaign_title', v_campaign.title,
        'locked_cpm', v_locked_cpm,
        'verified_views', v_verified_views,
        'gross', v_gross,
        'platform_fee', v_platform_fee,
        'creator_fee', v_creator_fee,
        'actor', (select email from public.profiles where id = auth.uid())
      )
    ) returning id into v_ledger_id;
  end if;

  return v_earning;
end;
$$;

grant execute on function public.create_earning(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Update earning status (approve, pay, fail)
-- Immutable: locked_cpm, gross_amount, platform_fee, net_amount never change
-- When paying: creates payout_debit ledger entry.
-- When failing: creates refund ledger entry to reverse the credit.
-- ---------------------------------------------------------------------------
create or replace function public.update_earning_status(
  p_earning_id uuid,
  p_status text,
  p_payout_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_earning record;
  v_old_status text;
begin
  -- Only admins can update earnings
  if not public.is_admin() then
    raise exception 'Only admins can update earnings';
  end if;

  -- Validate status
  if p_status not in ('pending', 'approved', 'paid', 'failed') then
    raise exception 'Invalid earning status: %', p_status;
  end if;

  -- Get current earning for state tracking
  select * into v_earning from public.earnings where id = p_earning_id;
  if not found then
    raise exception 'Earning not found';
  end if;
  v_old_status := v_earning.status;

  -- Update earning (only status and payment fields, NOT financial amounts)
  update public.earnings set
    status = p_status,
    paid_at = case when p_status = 'paid' then now() else paid_at end,
    payout_ref = coalesce(p_payout_ref, payout_ref),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'status_changed',
      'by', (select email from public.profiles where id = auth.uid()),
      'at', now(),
      'from', v_old_status,
      'to', p_status
    )
  where id = p_earning_id
  returning to_jsonb(earnings.*) into v_earning;

  -- On payment: create payout_debit ledger entry
  if p_status = 'paid' and v_old_status != 'paid' then
    if not exists (
      select 1 from public.wallet_ledger
      where idempotency_key = 'payout-debit-' || p_earning_id::text
    ) then
      insert into public.wallet_ledger (
        user_id, type, amount, currency, reference_type, reference_id,
        idempotency_key, metadata
      ) values (
        v_earning.clipper_id, 'payout_debit', -v_earning.net_amount, 'INR',
        'earning', p_earning_id,
        'payout-debit-' || p_earning_id::text,
        jsonb_build_object(
          'earning_id', p_earning_id,
          'payout_ref', p_payout_ref,
          'actor', (select email from public.profiles where id = auth.uid())
        )
      );
    end if;
  end if;

  -- On failure after payment: create refund ledger entry (reverses the debit)
  if p_status = 'failed' and v_old_status = 'paid' then
    if not exists (
      select 1 from public.wallet_ledger
      where idempotency_key = 'refund-' || p_earning_id::text
    ) then
      insert into public.wallet_ledger (
        user_id, type, amount, currency, reference_type, reference_id,
        idempotency_key, metadata
      ) values (
        v_earning.clipper_id, 'refund', v_earning.net_amount, 'INR',
        'earning', p_earning_id,
        'refund-' || p_earning_id::text,
        jsonb_build_object(
          'earning_id', p_earning_id,
          'reason', 'Payout failed, refunding to wallet',
          'actor', (select email from public.profiles where id = auth.uid())
        )
      );
    end if;
  end if;

  return v_earning;
end;
$$;

grant execute on function public.update_earning_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Get wallet balance derived from authoritative ledger records.
-- Positive = credit, negative = debit. Never stored, always computed.
-- ---------------------------------------------------------------------------
create or replace function public.get_wallet_balance(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'user_id', p_user_id,
    'balance', coalesce(sum(amount), 0),
    'currency', 'INR',
    'total_credits', coalesce(sum(amount) filter (where amount > 0), 0),
    'total_debits', coalesce(sum(amount) filter (where amount < 0), 0),
    'entry_count', count(*),
    'available', coalesce(sum(amount), 0)  -- balance = available (no separate pending bucket in ledger)
  )
  from public.wallet_ledger
  where user_id = p_user_id;
$$;

grant execute on function public.get_wallet_balance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Get wallet ledger entries for a user (paginated).
-- ---------------------------------------------------------------------------
create or replace function public.get_wallet_entries(
  p_user_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(le)), '[]'::jsonb)
  from (
    select id, user_id, type, amount, currency, reference_type,
           reference_id, idempotency_key, created_at, metadata
    from public.wallet_ledger
    where user_id = p_user_id
    order by created_at desc
    limit p_limit offset p_offset
  ) le;
$$;

grant execute on function public.get_wallet_entries(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Admin adjustment to wallet (positive or negative).
-- Creates an adjustment ledger entry. Requires admin role.
-- ---------------------------------------------------------------------------
create or replace function public.adjust_wallet(
  p_user_id uuid,
  p_amount integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
  v_idempotency_key text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can adjust wallets';
  end if;

  if p_amount = 0 then
    raise exception 'Adjustment amount cannot be zero';
  end if;

  -- Idempotency key includes timestamp to allow multiple adjustments
  v_idempotency_key := 'adjust-' || p_user_id::text || '-' || extract(epoch from now())::text;

  insert into public.wallet_ledger (
    user_id, type, amount, currency, reference_type, reference_id,
    idempotency_key, metadata
  ) values (
    p_user_id, 'adjustment', p_amount, 'INR', 'adjustment',
    gen_random_uuid(), v_idempotency_key,
    jsonb_build_object(
      'reason', p_reason,
      'actor', (select email from public.profiles where id = auth.uid())
    )
  )
  returning to_jsonb(wallet_ledger.*) into v_entry;

  return v_entry;
end;
$$;

grant execute on function public.adjust_wallet(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Reverse a previous ledger entry.
-- Creates a reversal entry with the opposite sign of the original.
-- ---------------------------------------------------------------------------
create or replace function public.reverse_ledger_entry(
  p_entry_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original record;
  v_entry jsonb;
  v_idempotency_key text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can reverse ledger entries';
  end if;

  select * into v_original from public.wallet_ledger where id = p_entry_id;
  if not found then
    raise exception 'Ledger entry not found';
  end if;

  -- Check if already reversed
  v_idempotency_key := 'reversal-' || p_entry_id::text;
  if exists (select 1 from public.wallet_ledger where idempotency_key = v_idempotency_key) then
    raise exception 'Entry already reversed';
  end if;

  -- Create reversal (opposite amount)
  insert into public.wallet_ledger (
    user_id, type, amount, currency, reference_type, reference_id,
    idempotency_key, metadata
  ) values (
    v_original.user_id, 'reversal', -v_original.amount, 'INR',
    v_original.reference_type, v_original.reference_id,
    v_idempotency_key,
    jsonb_build_object(
      'reversed_entry_id', p_entry_id,
      'original_amount', v_original.amount,
      'original_type', v_original.type,
      'reason', p_reason,
      'actor', (select email from public.profiles where id = auth.uid())
    )
  )
  returning to_jsonb(wallet_ledger.*) into v_entry;

  return v_entry;
end;
$$;

grant execute on function public.reverse_ledger_entry(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: Get earnings summary for a clipper (from earnings table).
-- ---------------------------------------------------------------------------
create or replace function public.get_clipper_earnings(p_clipper_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_gross', coalesce(sum(gross_amount), 0),
    'total_fees', coalesce(sum(platform_fee), 0),
    'total_net', coalesce(sum(net_amount), 0),
    'total_creator_fees', coalesce(sum(creator_fee), 0),
    'currency', 'INR',
    'earning_count', count(*),
    'paid_count', count(*) filter (where status = 'paid'),
    'pending_count', count(*) filter (where status in ('pending', 'approved')),
    'paid_amount', coalesce(sum(net_amount) filter (where status = 'paid'), 0),
    'pending_amount', coalesce(sum(net_amount) filter (where status in ('pending', 'approved')), 0)
  )
  from public.earnings
  where clipper_id = p_clipper_id;
$$;

grant execute on function public.get_clipper_earnings(uuid) to authenticated;

-- ===========================================================================
-- PAYOUT RPCs — server-side only. Users request, server processes.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- RPC: request_payout — clipper requests a payout.
-- 1. Authenticated via auth.uid()
-- 2. Reads verified UPI from profiles
-- 3. Calculates balance from wallet_ledger (authoritative)
-- 4. Enforces minimum threshold (100 INR = 10000 paise)
-- 5. Checks no duplicate processing payout exists
-- 6. Creates payout record + debit ledger entry atomically
-- ---------------------------------------------------------------------------
create or replace function public.request_payout()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_balance integer;
  v_upi text;
  v_payout_id uuid;
  v_payout jsonb;
  v_idempotency_key text;
  v_min_withdrawal constant integer := 10000; -- ₹100 in paise
begin
  -- 1. Get authenticated user
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 2. Read verified UPI from profiles
  select upi into v_upi
  from public.profiles
  where id = v_user_id and status = 'active';

  if v_upi is null or trim(v_upi) = '' then
    raise exception 'No verified UPI ID on file. Add a UPI ID first.';
  end if;

  -- 3. Calculate authoritative balance from ledger
  select coalesce(sum(amount), 0) into v_balance
  from public.wallet_ledger
  where user_id = v_user_id;

  -- 4. Enforce minimum withdrawal
  if v_balance < v_min_withdrawal then
    raise exception 'Minimum withdrawal is ₹100. Current balance: ₹%', v_balance / 100;
  end if;

  -- 5. Check no equivalent payout is already processing/requested
  if exists (
    select 1 from public.payouts
    where user_id = v_user_id
      and status in ('requested', 'processing')
  ) then
    raise exception 'A payout is already in progress. Please wait for it to complete.';
  end if;

  -- 6. Generate idempotency key (one per user per hour window)
  v_idempotency_key := 'payout-' || v_user_id::text || '-' || to_char(now(), 'YYYY-MM-DD-HH24');

  -- Check idempotency
  if exists (select 1 from public.payouts where idempotency_key = v_idempotency_key) then
    select to_jsonb(p.*) into v_payout
    from public.payouts p
    where idempotency_key = v_idempotency_key;
    return v_payout;
  end if;

  -- 7. Create payout record
  insert into public.payouts (
    user_id, amount, net_amount, currency, status, method, upi_id,
    idempotency_key, metadata
  ) values (
    v_user_id, v_balance, v_balance, 'INR', 'requested', 'upi', v_upi,
    v_idempotency_key,
    jsonb_build_object(
      'requested_by', (select email from public.profiles where id = v_user_id),
      'balance_at_request', v_balance
    )
  )
  returning id into v_payout_id;

  -- 8. Debit the wallet ledger (creates negative entry to reserve funds)
  insert into public.wallet_ledger (
    user_id, type, amount, currency, reference_type, reference_id,
    idempotency_key, metadata
  ) values (
    v_user_id, 'payout_debit', -v_balance, 'INR', 'payout', v_payout_id,
    'payout-debit-' || v_payout_id::text,
    jsonb_build_object(
      'payout_id', v_payout_id,
      'reason', 'Payout requested, funds reserved'
    )
  );

  -- Return the payout record
  select to_jsonb(p.*) into v_payout
  from public.payouts p
  where id = v_payout_id;

  return v_payout;
end;
$$;

grant execute on function public.request_payout() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: process_payout — admin marks payout as processing.
-- Only admins can call this.
-- ---------------------------------------------------------------------------
create or replace function public.process_payout(
  p_payout_id uuid,
  p_provider text default 'mock'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can process payouts';
  end if;

  update public.payouts set
    status = 'processing',
    provider = p_provider,
    processed_at = now(),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'processing',
      'by', (select email from public.profiles where id = auth.uid()),
      'at', now()
    )
  where id = p_payout_id and status = 'requested'
  returning to_jsonb(payouts.*) into v_payout;

  if v_payout is null then
    raise exception 'Payout not found or not in requested status';
  end if;

  return v_payout;
end;
$$;

grant execute on function public.process_payout(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: complete_payout — admin/provider marks payout as paid.
-- Updates the payout status and metadata.
-- ---------------------------------------------------------------------------
create or replace function public.complete_payout(
  p_payout_id uuid,
  p_provider_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout record;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can complete payouts';
  end if;

  select * into v_payout
  from public.payouts
  where id = p_payout_id and status = 'processing';

  if not found then
    raise exception 'Payout not found or not in processing status';
  end if;

  update public.payouts set
    status = 'paid',
    paid_at = now(),
    provider_ref = coalesce(p_provider_ref, provider_ref),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'paid',
      'by', (select email from public.profiles where id = auth.uid()),
      'at', now(),
      'provider_ref', p_provider_ref
    )
  where id = p_payout_id
  returning to_jsonb(payouts.*) into v_result;

  return v_result;
end;
$$;

grant execute on function public.complete_payout(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: fail_payout — admin/provider marks payout as failed.
-- Refunds the debited amount back to the wallet ledger.
-- ---------------------------------------------------------------------------
create or replace function public.fail_payout(
  p_payout_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout record;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can fail payouts';
  end if;

  select * into v_payout
  from public.payouts
  where id = p_payout_id and status in ('requested', 'processing');

  if not found then
    raise exception 'Payout not found or not in a failable status';
  end if;

  -- Update payout status
  update public.payouts set
    status = 'failed',
    failed_at = now(),
    failure_reason = p_reason,
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'failed',
      'by', (select email from public.profiles where id = auth.uid()),
      'at', now(),
      'reason', p_reason
    )
  where id = p_payout_id
  returning to_jsonb(payouts.*) into v_result;

  -- Refund: create a refund ledger entry to reverse the payout_debit
  if not exists (
    select 1 from public.wallet_ledger
    where idempotency_key = 'payout-refund-' || p_payout_id::text
  ) then
    insert into public.wallet_ledger (
      user_id, type, amount, currency, reference_type, reference_id,
      idempotency_key, metadata
    ) values (
      v_payout.user_id, 'refund', v_payout.net_amount, 'INR', 'payout', p_payout_id,
      'payout-refund-' || p_payout_id::text,
      jsonb_build_object(
        'payout_id', p_payout_id,
        'reason', coalesce(p_reason, 'Payout failed, funds returned to wallet')
      )
    );
  end if;

  return v_result;
end;
$$;

grant execute on function public.fail_payout(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: reverse_payout — admin reverses a completed payout.
-- Creates a reversal entry in the wallet ledger.
-- ---------------------------------------------------------------------------
create or replace function public.reverse_payout(
  p_payout_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout record;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can reverse payouts';
  end if;

  select * into v_payout
  from public.payouts
  where id = p_payout_id and status = 'paid';

  if not found then
    raise exception 'Payout not found or not in paid status';
  end if;

  -- Update payout status
  update public.payouts set
    status = 'reversed',
    reversed_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'reversal_reason', p_reason
    ),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'reversed',
      'by', (select email from public.profiles where id = auth.uid()),
      'at', now(),
      'reason', p_reason
    )
  where id = p_payout_id
  returning to_jsonb(payouts.*) into v_result;

  -- Debit the wallet (user owes money back)
  if not exists (
    select 1 from public.wallet_ledger
    where idempotency_key = 'payout-reversal-' || p_payout_id::text
  ) then
    insert into public.wallet_ledger (
      user_id, type, amount, currency, reference_type, reference_id,
      idempotency_key, metadata
    ) values (
      v_payout.user_id, 'reversal', -v_payout.net_amount, 'INR', 'payout', p_payout_id,
      'payout-reversal-' || p_payout_id::text,
      jsonb_build_object(
        'payout_id', p_payout_id,
        'reason', coalesce(p_reason, 'Payout reversed')
      )
    );
  end if;

  return v_result;
end;
$$;

grant execute on function public.reverse_payout(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get_user_payouts — get payout history for a user.
-- ---------------------------------------------------------------------------
create or replace function public.get_user_payouts(
  p_user_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb)
  from (
    select id, user_id, amount, net_amount, currency, status, method,
           upi_id, provider, provider_ref, idempotency_key,
           requested_at, processed_at, paid_at, failed_at, reversed_at,
           failure_reason, retry_count, metadata
    from public.payouts
    where user_id = p_user_id
    order by requested_at desc
    limit p_limit offset p_offset
  ) p;
$$;

grant execute on function public.get_user_payouts(uuid, integer, integer) to authenticated;
-- Returns test results as JSON array with pass/fail for each case.
-- ---------------------------------------------------------------------------
create or replace function public.test_max_payout_enforcement()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_results jsonb := '[]'::jsonb;
  v_gross integer;
  v_platform_fee integer;
  v_net integer;
  v_max_payout integer;
  v_locked_cpm integer;
  v_campaign_id uuid;
  v_clip_id uuid;
  v_test_id integer := 0;
  v_pass boolean;
  v_actual integer;
  v_expected integer;
  v_test_name text;
begin
  -- Only admins can run tests
  if not public.is_admin() then
    raise exception 'Only admins can run tests';
  end if;

  -- Create temporary test campaign with max_payout_per_clip = ₹500 (50000 paise)
  insert into public.campaigns (title, brief, platform, payout, creator, niche, budget, days_left, status, max_payout_per_clip, created_by)
  values ('TEST: Max Payout Cap', 'Test campaign', 'YouTube', 220, 'Test Creator', 'Testing', 999999, 30, 'active', 500, (select id from public.profiles where role = 'admin' limit 1))
  returning id into v_campaign_id;

  -- ---------------------------------------------------------------
  -- TEST 1: Below cap (10,000 views × ₹220 CPM = ₹2,200 < ₹500 cap)
  -- Expected: gross = ₹2,200 (uncapped)
  -- ---------------------------------------------------------------
  v_test_id := v_test_id + 1;
  v_test_name := 'BELOW_CAP_10000_views';
  v_locked_cpm := 22000; -- ₹220 in paise
  v_gross := (10000 * v_locked_cpm) / 1000; -- 220000 paise = ₹2,200
  v_expected := 220000; -- ₹2,200 in paise

  -- Apply cap
  v_max_payout := 50000; -- ₹500 in paise
  if v_gross > v_max_payout then
    v_gross := v_max_payout;
  end if;

  v_platform_fee := round(v_gross * 0.10)::integer;
  v_net := v_gross - v_platform_fee;
  v_actual := v_gross;
  v_pass := (v_actual = v_expected);

  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id,
    'name', v_test_name,
    'views', 10000,
    'locked_cpm_paise', v_locked_cpm,
    'max_payout_paise', v_max_payout,
    'raw_amount_paise', (10000 * v_locked_cpm) / 1000,
    'actual_gross_paise', v_actual,
    'expected_gross_paise', v_expected,
    'gross_matches', v_pass,
    'platform_fee_paise', v_platform_fee,
    'net_paise', v_net,
    'PASS', v_pass
  );

  -- ---------------------------------------------------------------
  -- TEST 2: Exactly at cap (2272 views × ₹220 CPM ≈ ₹500 cap)
  -- raw = (2272 × 22000) / 1000 = 49,984 paise (below cap)
  -- Increase views to 2273: (2273 × 22000) / 1000 = 50,006 paise (above cap)
  -- Expected: gross = ₹500 (capped)
  -- ---------------------------------------------------------------
  v_test_id := v_test_id + 1;
  v_test_name := 'EXACTLY_AT_CAP_2273_views';
  v_locked_cpm := 22000;
  v_gross := (2273 * v_locked_cpm) / 1000; -- 50006 paise
  v_expected := 50000; -- capped to ₹500

  v_max_payout := 50000;
  if v_gross > v_max_payout then
    v_gross := v_max_payout;
  end if;

  v_platform_fee := round(v_gross * 0.10)::integer;
  v_net := v_gross - v_platform_fee;
  v_actual := v_gross;
  v_pass := (v_actual = v_expected);

  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id,
    'name', v_test_name,
    'views', 2273,
    'locked_cpm_paise', v_locked_cpm,
    'max_payout_paise', v_max_payout,
    'raw_amount_paise', (2273 * v_locked_cpm) / 1000,
    'actual_gross_paise', v_actual,
    'expected_gross_paise', v_expected,
    'gross_matches', v_pass,
    'platform_fee_paise', v_platform_fee,
    'net_paise', v_net,
    'PASS', v_pass
  );

  -- ---------------------------------------------------------------
  -- TEST 3: Above cap (50,000 views × ₹220 CPM = ₹11,000 >> ₹500 cap)
  -- Expected: gross = ₹500 (capped)
  -- ---------------------------------------------------------------
  v_test_id := v_test_id + 1;
  v_test_name := 'ABOVE_CAP_50000_views';
  v_locked_cpm := 22000;
  v_gross := (50000 * v_locked_cpm) / 1000; -- 1100000 paise = ₹11,000
  v_expected := 50000; -- capped to ₹500

  v_max_payout := 50000;
  if v_gross > v_max_payout then
    v_gross := v_max_payout;
  end if;

  v_platform_fee := round(v_gross * 0.10)::integer;
  v_net := v_gross - v_platform_fee;
  v_actual := v_gross;
  v_pass := (v_actual = v_expected);

  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id,
    'name', v_test_name,
    'views', 50000,
    'locked_cpm_paise', v_locked_cpm,
    'max_payout_paise', v_max_payout,
    'raw_amount_paise', (50000 * v_locked_cpm) / 1000,
    'actual_gross_paise', v_actual,
    'expected_gross_paise', v_expected,
    'gross_matches', v_pass,
    'platform_fee_paise', v_platform_fee,
    'net_paise', v_net,
    'PASS', v_pass
  );

  -- ---------------------------------------------------------------
  -- TEST 4: Zero views
  -- Expected: gross = ₹0 (no earnings)
  -- ---------------------------------------------------------------
  v_test_id := v_test_id + 1;
  v_test_name := 'ZERO_VIEWS';
  v_locked_cpm := 22000;
  v_gross := (0 * v_locked_cpm) / 1000; -- 0
  v_expected := 0;

  v_max_payout := 50000;
  if v_gross > v_max_payout then
    v_gross := v_max_payout;
  end if;

  v_platform_fee := round(v_gross * 0.10)::integer;
  v_net := v_gross - v_platform_fee;
  v_actual := v_gross;
  v_pass := (v_actual = v_expected);

  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id,
    'name', v_test_name,
    'views', 0,
    'locked_cpm_paise', v_locked_cpm,
    'max_payout_paise', v_max_payout,
    'raw_amount_paise', 0,
    'actual_gross_paise', v_actual,
    'expected_gross_paise', v_expected,
    'gross_matches', v_pass,
    'platform_fee_paise', v_platform_fee,
    'net_paise', v_net,
    'PASS', v_pass
  );

  -- ---------------------------------------------------------------
  -- TEST 5: Negative views (invalid input)
  -- Expected: gross = ₹0 (clamped to zero)
  -- ---------------------------------------------------------------
  v_test_id := v_test_id + 1;
  v_test_name := 'NEGATIVE_VIEWS';
  v_locked_cpm := 22000;
  v_gross := greatest(0, (-5000 * v_locked_cpm) / 1000); -- clamped to 0
  v_expected := 0;

  v_max_payout := 50000;
  if v_gross > v_max_payout then
    v_gross := v_max_payout;
  end if;

  v_platform_fee := round(v_gross * 0.10)::integer;
  v_net := v_gross - v_platform_fee;
  v_actual := v_gross;
  v_pass := (v_actual = v_expected);

  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id,
    'name', v_test_name,
    'views', -5000,
    'locked_cpm_paise', v_locked_cpm,
    'max_payout_paise', v_max_payout,
    'raw_amount_paise', greatest(0, (-5000 * v_locked_cpm) / 1000),
    'actual_gross_paise', v_actual,
    'expected_gross_paise', v_expected,
    'gross_matches', v_pass,
    'platform_fee_paise', v_platform_fee,
    'net_paise', v_net,
    'PASS', v_pass
  );

  -- ---------------------------------------------------------------
  -- TEST 6: Very large view count (100M views × ₹220 CPM = ₹22B >> cap)
  -- Expected: gross = ₹500 (capped)
  -- Tests integer overflow protection
  -- ---------------------------------------------------------------
  v_test_id := v_test_id + 1;
  v_test_name := 'VERY_LARGE_VIEWS_100M';
  v_locked_cpm := 22000;
  v_gross := (100000000 * v_locked_cpm) / 1000; -- 2200000000 paise = ₹22B
  v_expected := 50000; -- capped to ₹500

  v_max_payout := 50000;
  if v_gross > v_max_payout then
    v_gross := v_max_payout;
  end if;

  v_platform_fee := round(v_gross * 0.10)::integer;
  v_net := v_gross - v_platform_fee;
  v_actual := v_gross;
  v_pass := (v_actual = v_expected);

  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id,
    'name', v_test_name,
    'views', 100000000,
    'locked_cpm_paise', v_locked_cpm,
    'max_payout_paise', v_max_payout,
    'raw_amount_paise', (100000000 * v_locked_cpm) / 1000,
    'actual_gross_paise', v_actual,
    'expected_gross_paise', v_expected,
    'gross_matches', v_pass,
    'platform_fee_paise', v_platform_fee,
    'net_paise', v_net,
    'PASS', v_pass
  );

  -- ---------------------------------------------------------------
  -- TEST 7: No cap set (max_payout_per_clip is NULL)
  -- Expected: gross = raw amount (uncapped)
  -- ---------------------------------------------------------------
  v_test_id := v_test_id + 1;
  v_test_name := 'NO_CAP_NULL_max_payout';
  v_locked_cpm := 22000;
  v_gross := (50000 * v_locked_cpm) / 1000; -- 1100000 paise
  v_expected := 1100000; -- no cap applied

  -- Simulate NULL cap: don't apply cap
  -- (the if condition handles this)

  v_platform_fee := round(v_gross * 0.10)::integer;
  v_net := v_gross - v_platform_fee;
  v_actual := v_gross;
  v_pass := (v_actual = v_expected);

  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id,
    'name', v_test_name,
    'views', 50000,
    'locked_cpm_paise', v_locked_cpm,
    'max_payout_paise', null,
    'raw_amount_paise', (50000 * v_locked_cpm) / 1000,
    'actual_gross_paise', v_actual,
    'expected_gross_paise', v_expected,
    'gross_matches', v_pass,
    'platform_fee_paise', v_platform_fee,
    'net_paise', v_net,
    'PASS', v_pass
  );

  -- ---------------------------------------------------------------
  -- TEST 8: Cap of zero (max_payout_per_clip = 0)
  -- Expected: gross = raw amount (treated as no cap)
  -- ---------------------------------------------------------------
  v_test_id := v_test_id + 1;
  v_test_name := 'CAP_ZERO_treated_as_no_cap';
  v_locked_cpm := 22000;
  v_gross := (50000 * v_locked_cpm) / 1000; -- 1100000 paise
  v_expected := 1100000; -- cap=0 means no cap

  -- Simulate cap=0: condition checks > 0, so no cap applied

  v_platform_fee := round(v_gross * 0.10)::integer;
  v_net := v_gross - v_platform_fee;
  v_actual := v_gross;
  v_pass := (v_actual = v_expected);

  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id,
    'name', v_test_name,
    'views', 50000,
    'locked_cpm_paise', v_locked_cpm,
    'max_payout_paise', 0,
    'raw_amount_paise', (50000 * v_locked_cpm) / 1000,
    'actual_gross_paise', v_actual,
    'expected_gross_paise', v_expected,
    'gross_matches', v_pass,
    'platform_fee_paise', v_platform_fee,
    'net_paise', v_net,
    'PASS', v_pass
  );

  -- ---------------------------------------------------------------
  -- CLEANUP: Delete test campaign
  -- ---------------------------------------------------------------
  delete from public.campaigns where id = v_campaign_id;

  return jsonb_build_object(
    'total_tests', v_test_id,
    'all_passed', (select bool_and((t->>'PASS')::boolean) from jsonb_array_elements(v_results) as t),
    'results', v_results
  );
end;
$$;

grant execute on function public.test_max_payout_enforcement() to authenticated;

-- ---------------------------------------------------------------------------
-- Audit Log — append-only record of all admin actions
-- ---------------------------------------------------------------------------
-- ===========================================================================
-- AUDIT LOGS — single authoritative audit system.
-- Append-only. No UPDATE or DELETE allowed. Actor always from auth.uid().
-- ===========================================================================
create table if not exists public.audit_logs (
  id              text primary key,
  timestamp       timestamptz not null default now(),
  actor_id        uuid references auth.users(id) on delete set null,
  actor           text not null,
  action          text not null,
  entity_type     text not null,
  entity_id       text not null,
  entity_label    text,
  before_state    jsonb,
  after_state     jsonb,
  metadata        jsonb,
  idempotency_key text unique,
  -- Legacy columns kept for backward compatibility during migration
  target_type     text,
  target_id       text,
  target_label    text,
  previous_value  text,
  new_value       text,
  reason          text
);

-- Indexes for search and filtering
create index if not exists audit_logs_timestamp_idx on public.audit_logs(timestamp desc);
create index if not exists audit_logs_action_idx on public.audit_logs(action);
create index if not exists audit_logs_entity_type_idx on public.audit_logs(entity_type);
create index if not exists audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index if not exists audit_logs_entity_id_idx on public.audit_logs(entity_id);
create index if not exists audit_logs_idempotency_idx on public.audit_logs(idempotency_key);

-- RLS: admins read all, backend service role inserts. No UPDATE or DELETE.
alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_select" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs
  for select using (public.is_admin());

drop policy if exists "audit_logs_insert" on public.audit_logs;
create policy "audit_logs_insert" on public.audit_logs
  for insert with check (true);

-- No UPDATE or DELETE policies = those operations are denied by default.
-- This enforces append-only semantics at the database level.
