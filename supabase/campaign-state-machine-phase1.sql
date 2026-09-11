-- ============================================================================
-- PHASE 1: Campaign creation state machine hardening
-- ============================================================================
-- Goal: A campaign can NEVER become publicly active/open before its launch
-- payment has been verified by an Admin.
--
-- Changes:
--   1. Fix column defaults: status='draft', launch_payment_status='pending'
--   2. Remove p_status from create_campaign (always draft + pending)
--   3. Add UPDATE trigger: open requires verified payment
--   4. Fix campaign_action('publish'): require verified payment
-- ============================================================================

-- ── 1. Fix column defaults ──────────────────────────────────────────────────
-- Previous defaults were dangerous: status='open' and launch_payment_status='verified'.
-- New campaigns via direct INSERT (bypassing RPC) would be immediately visible.
-- These ALTERs do NOT affect existing rows — only future inserts.

ALTER TABLE public.campaigns
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.campaigns
  ALTER COLUMN launch_payment_status SET DEFAULT 'pending';

COMMENT ON COLUMN public.campaigns.status IS
  'Campaign lifecycle status. New campaigns must start as draft; open requires verified launch payment.';

COMMENT ON COLUMN public.campaigns.launch_payment_status IS
  'Payment verification status. Only Admin-controlled RPCs may set this to verified.';

-- ── 2. Enforce safe defaults on INSERT (defense-in-depth) ───────────────────
-- Safety net: even if a direct INSERT bypasses the column defaults or the
-- create_campaign RPC, this trigger forces status='draft' and
-- launch_payment_status='pending'. Prevents any path to an open/unverified
-- campaign via direct INSERT.

CREATE OR REPLACE FUNCTION public.enforce_campaign_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always force safe initial state on INSERT, regardless of provided values
  NEW.status := 'draft';
  NEW.launch_payment_status := 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_campaign_insert_defaults ON public.campaigns;
CREATE TRIGGER enforce_campaign_insert_defaults
  BEFORE INSERT ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_campaign_insert_defaults();

-- ── 3. Remove p_status from create_campaign ─────────────────────────────────
-- The caller must never be able to request an unsafe initial state.
-- Status is always forced to 'draft' with launch_payment_status='pending'.

CREATE OR REPLACE FUNCTION public.create_campaign(
  p_title text,
  p_brief text,
  p_platform text,
  p_payout numeric,
  p_creator text,
  p_id uuid default null,
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
DECLARE
  v_user_id uuid;
  v_role text;
  v_status text;
  v_campaign jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, status INTO v_role, v_status
  FROM public.profiles WHERE id = v_user_id;

  IF v_role IS DISTINCT FROM 'creator' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Only active creators can create campaigns';
  END IF;

  -- SECURITY: Always force safe defaults. No status parameter is accepted.
  -- Campaign becomes 'open' only after Admin verifies launch payment.
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, niche, budget,
    days_left, source_link, rules, category, platforms, objective,
    start_date, end_date, max_payout_per_clip, recommended_duration,
    hook, caption_req, aspect_ratio, cta, branding, do_list, dont_list,
    source_assets, example_clips, view_rules, approval, thumbnails,
    brand_assets, spend_cap, timezone, what_to_make, style, rights,
    status, launch_payment_status
  ) VALUES (
    coalesce(p_id, gen_random_uuid()), p_title, p_brief, p_platform,
    p_payout, p_creator, p_niche, p_budget, p_days_left, p_source_link,
    p_rules, p_category, p_platforms, p_objective, p_start_date, p_end_date,
    p_max_payout_per_clip, p_recommended_duration, p_hook, p_caption_req,
    p_aspect_ratio, p_cta, p_branding, p_do_list, p_dont_list,
    p_source_assets, p_example_clips, p_view_rules, p_approval, p_thumbnails,
    p_brand_assets, p_spend_cap, p_timezone, p_what_to_make, p_style, p_rights,
    'draft', 'pending'
  )
  RETURNING to_jsonb(campaigns.*) INTO v_campaign;

  -- Audit log
  INSERT INTO public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id, entity_label,
    after_state, idempotency_key
  ) VALUES (
    gen_random_uuid()::text, v_user_id, 'creator',
    'campaign_created', 'campaign', (v_campaign->>'id'),
    p_title,
    jsonb_build_object('status', 'draft', 'budget', p_budget, 'launch_payment_status', 'pending'),
    'campaign_create_' || (v_campaign->>'id') || '_' || extract(epoch from now())::text
  );

  RETURN v_campaign;
END;
$$;

-- Update GRANT to match new signature (no p_status parameter)
GRANT EXECUTE ON FUNCTION public.create_campaign(
  text, text, text, numeric, text, uuid, text, numeric, integer,
  text, text, text, jsonb, text, date, date, numeric, text,
  text, text, text, text, text, jsonb, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, jsonb, numeric, text, text, text, jsonb
) TO authenticated;

-- ── 4. UPDATE trigger: open requires verified payment ────────────────────────
-- Safety net: prevents any direct UPDATE from setting status='open' when
-- launch_payment_status is not 'verified'. Admin SECURITY DEFINER RPCs
-- (verify_campaign_launch_payment) set both in the same UPDATE statement,
-- so the trigger sees the new launch_payment_status='verified' and allows it.

CREATE OR REPLACE FUNCTION public.enforce_campaign_open_requires_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only block the specific violation: setting status to open without verified payment
  IF NEW.status = 'open' AND NEW.launch_payment_status IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'Campaign cannot be set to open: launch payment has not been verified (current payment status: %)', NEW.launch_payment_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_campaign_open_requires_verified ON public.campaigns;
CREATE TRIGGER enforce_campaign_open_requires_verified
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_campaign_open_requires_verified();

-- ── 5. Fix campaign_action('publish'): require verified payment ──────────────
-- The owner 'publish' action previously transitioned draft -> open without
-- checking launch_payment_status. This is now gated on payment verification.

CREATE OR REPLACE FUNCTION public.campaign_action(
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
begin
  v_actor := auth.uid();
  if v_actor is null then raise exception 'Not authenticated'; end if;

  if p_action not in ('pause', 'resume', 'close', 'reopen', 'publish') then
    raise exception 'Invalid action: %', p_action;
  end if;

  select * into v_campaign from public.campaigns where id = p_campaign_id;
  if not found then raise exception 'Campaign not found'; end if;

  -- Authorization: only the campaign owner can perform lifecycle actions
  if v_campaign.created_by is null or v_campaign.created_by != v_actor then
    raise exception 'Only the campaign owner can perform this action';
  end if;

  -- Validate state transitions
  case p_action
    when 'pause' then
      if v_campaign.status != 'open' then
        raise exception 'Can only pause an open campaign (current: %)', v_campaign.status;
      end if;
      v_new_status := 'paused';
    when 'resume' then
      if v_campaign.status != 'paused' then
        raise exception 'Can only resume a paused campaign (current: %)', v_campaign.status;
      end if;
      v_new_status := 'open';
    when 'close' then
      if v_campaign.status not in ('open', 'paused') then
        raise exception 'Can only close an open or paused campaign (current: %)', v_campaign.status;
      end if;
      v_new_status := 'closed';
    when 'reopen' then
      if v_campaign.status != 'closed' then
        raise exception 'Can only reopen a closed campaign (current: %)', v_campaign.status;
      end if;
      v_new_status := 'open';
    when 'publish' then
      if v_campaign.status != 'draft' then
        raise exception 'Can only publish a draft campaign (current: %)', v_campaign.status;
      end if;
      -- PHASE 1: Launch payment must be verified before publishing
      if v_campaign.launch_payment_status is distinct from 'verified' then
        raise exception 'Cannot publish: launch payment has not been verified (current payment status: %)', v_campaign.launch_payment_status;
      end if;
      v_new_status := 'open';
  end case;

  update public.campaigns set status = v_new_status where id = p_campaign_id;

  -- Write audit log directly (security definer bypasses RLS)
  insert into public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id, entity_label,
    before_state, after_state, metadata, idempotency_key
  ) values (
    'audit-' || extract(epoch from now())::bigint || '-' || upper(md5(random()::text)),
    v_actor,
    coalesce((select email from public.profiles where id = v_actor), 'unknown'),
    'campaign_' || p_action,
    'campaign',
    p_campaign_id::text,
    v_campaign.title,
    jsonb_build_object('status', v_campaign.status),
    jsonb_build_object('status', v_new_status),
    jsonb_build_object('reason', p_reason, 'action', p_action, 'actor_type', 'owner'),
    'campaign-' || p_campaign_id::text || '-' || p_action || '-' || extract(epoch from now())::bigint
  );

  return jsonb_build_object('success', true, 'action', p_action, 'campaign_id', p_campaign_id, 'to', v_new_status);
end;
$$;

grant execute on function public.campaign_action(uuid, text, text) to authenticated;

-- ============================================================================
-- END PHASE 1
-- ============================================================================
