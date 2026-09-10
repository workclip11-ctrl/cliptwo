-- ============================================================================
-- CAMPAIGN LAUNCH PAYMENTS
-- ============================================================================
-- Adds a 10% platform fee on campaign launch. Creators pay via manual UPI/QR.
-- Campaign is not visible to clippers until admin verifies payment.
--
-- Run order: AFTER schema.sql, admin-schema.sql, financial-rewrite.sql
-- ============================================================================

-- ── 1. Add launch_payment_status to campaigns ──────────────────────────────
-- Uses existing campaign status lifecycle: draft -> open
-- launch_payment_status tracks the separate payment verification state.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'launch_payment_status'
  ) THEN
    ALTER TABLE public.campaigns
      ADD COLUMN launch_payment_status text NOT NULL DEFAULT 'verified'
      CHECK (launch_payment_status IN ('pending','submitted','verified','rejected'));
  END IF;
END $$;

-- Backfill: all existing campaigns are already paid/verified
UPDATE public.campaigns
SET launch_payment_status = 'verified'
WHERE launch_payment_status = 'pending'
   OR status IN ('open','closed','paused','near_budget','budget_reached');

-- ── 2. Campaign launch payments table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campaign_launch_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  creator_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_budget_rupees numeric NOT NULL CHECK (campaign_budget_rupees >= 0),
  platform_fee_paise    integer NOT NULL CHECK (platform_fee_paise >= 0),
  total_payable_paise   integer NOT NULL CHECK (total_payable_paise >= 0),
  payment_status        text NOT NULL DEFAULT 'pending'
                        CHECK (payment_status IN ('pending','submitted','verified','rejected')),
  utr_reference         text,
  rejection_reason      text,
  submitted_at          timestamptz,
  verified_at           timestamptz,
  verified_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at           timestamptz,
  rejected_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_launch_payments_campaign_unique
    UNIQUE (campaign_id)  -- one payment record per campaign
);

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_campaign_launch_payments_status
  ON public.campaign_launch_payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_campaign_launch_payments_creator
  ON public.campaign_launch_payments(creator_id);

-- ── 3. RLS policies ────────────────────────────────────────────────────────

ALTER TABLE public.campaign_launch_payments ENABLE ROW LEVEL SECURITY;

-- Creator: can view own payment records
DROP POLICY IF EXISTS campaign_launch_payments_select_creator ON public.campaign_launch_payments;
CREATE POLICY campaign_launch_payments_select_creator
  ON public.campaign_launch_payments FOR SELECT
  USING (auth.uid() = creator_id);

-- Admin: can view all payment records
DROP POLICY IF EXISTS campaign_launch_payments_select_admin ON public.campaign_launch_payments;
CREATE POLICY campaign_launch_payments_select_admin
  ON public.campaign_launch_payments FOR SELECT
  USING (public.is_admin());

-- Creator: can insert payment records for their own campaigns
DROP POLICY IF EXISTS campaign_launch_payments_insert_creator ON public.campaign_launch_payments;
CREATE POLICY campaign_launch_payments_insert_creator
  ON public.campaign_launch_payments FOR INSERT
  WITH CHECK (
    auth.uid() = creator_id
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND c.created_by = auth.uid()
    )
  );

-- Creator: can update own payment records (for resubmission after rejection)
DROP POLICY IF EXISTS campaign_launch_payments_update_creator ON public.campaign_launch_payments;
CREATE POLICY campaign_launch_payments_update_creator
  ON public.campaign_launch_payments FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- Admin: can update all payment records (for verification/rejection)
DROP POLICY IF EXISTS campaign_launch_payments_update_admin ON public.campaign_launch_payments;
CREATE POLICY campaign_launch_payments_update_admin
  ON public.campaign_launch_payments FOR UPDATE
  USING (public.is_admin());

-- ── 4. Platform fee constant ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_platform_fee_percent()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 10;
$$;

-- ── 5. Submit campaign launch payment (Creator) ────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_campaign_launch_payment(
  p_campaign_id uuid,
  p_utr_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
  v_campaign_budget numeric;
  v_platform_fee_paise integer;
  v_total_payable_paise integer;
  v_budget_paise integer;
  v_existing record;
  v_payment record;
BEGIN
  -- Authenticate
  v_creator_id := auth.uid();
  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate UTR
  IF p_utr_reference IS NULL OR length(trim(p_utr_reference)) = 0 THEN
    RAISE EXCEPTION 'UTR reference is required';
  END IF;

  -- Validate campaign exists, belongs to this creator, and is in a submittable state
  SELECT budget INTO v_campaign_budget
  FROM public.campaigns
  WHERE id = p_campaign_id AND created_by = v_creator_id;

  IF v_campaign_budget IS NULL THEN
    RAISE EXCEPTION 'Campaign not found or access denied';
  END IF;

  -- Only allow payment submission for campaigns in draft or open status
  -- (open allows resubmission if payment was previously rejected)
  -- Prevents paying for closed, paused, or archived campaigns
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE id = p_campaign_id AND status IN ('draft', 'open')
  ) THEN
    RAISE EXCEPTION 'Cannot submit payment for a campaign with status other than draft or open';
  END IF;

  -- Calculate platform fee: 10% of budget (budget is in rupees)
  -- Store in paise for consistency with financial_records
  v_budget_paise := (v_campaign_budget * 100)::integer;
  v_platform_fee_paise := (v_campaign_budget * 100 * 0.10)::integer;
  v_total_payable_paise := v_budget_paise + v_platform_fee_paise;

  -- Check for existing payment record
  SELECT id, payment_status INTO v_existing
  FROM public.campaign_launch_payments
  WHERE campaign_id = p_campaign_id;

  IF v_existing IS NOT NULL THEN
    -- Allow resubmission only if rejected or pending
    IF v_existing.payment_status NOT IN ('rejected', 'pending') THEN
      RAISE EXCEPTION 'A verified/submitted payment already exists for this campaign';
    END IF;

    -- Safety: campaign must still be in draft or open status for resubmission
    IF NOT EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = p_campaign_id AND status IN ('draft', 'open')
    ) THEN
      RAISE EXCEPTION 'Cannot resubmit payment for a campaign with status other than draft or open';
    END IF;

    -- Update existing record (resubmission after rejection)
    UPDATE public.campaign_launch_payments
    SET
      utr_reference = trim(p_utr_reference),
      payment_status = 'submitted',
      submitted_at = now(),
      rejection_reason = NULL,
      rejected_at = NULL,
      rejected_by = NULL,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_payment;

    -- Update campaign payment status
    UPDATE public.campaigns
    SET launch_payment_status = 'submitted'
    WHERE id = p_campaign_id;

    -- Audit log
    INSERT INTO public.audit_logs (
      id, actor_id, actor, action, entity_type, entity_id, entity_label,
      after_state, metadata, idempotency_key
    ) VALUES (
      gen_random_uuid()::text, v_creator_id, 'creator',
      'campaign_payment_submitted', 'campaign', p_campaign_id::text,
      (SELECT title FROM public.campaigns WHERE id = p_campaign_id),
      jsonb_build_object('payment_status', 'submitted', 'utr', trim(p_utr_reference)),
      jsonb_build_object('campaign_budget_rupees', v_campaign_budget, 'platform_fee_paise', v_platform_fee_paise, 'total_payable_paise', v_total_payable_paise),
      'payment_submit_' || p_campaign_id::text || '_' || extract(epoch from now())::text
    );
  ELSE
    -- Create new payment record
    INSERT INTO public.campaign_launch_payments (
      campaign_id, creator_id, campaign_budget_rupees,
      platform_fee_paise, total_payable_paise,
      payment_status, utr_reference, submitted_at
    ) VALUES (
      p_campaign_id, v_creator_id, v_campaign_budget,
      v_platform_fee_paise, v_total_payable_paise,
      'submitted', trim(p_utr_reference), now()
    ) RETURNING * INTO v_payment;

    -- Update campaign payment status
    UPDATE public.campaigns
    SET launch_payment_status = 'submitted'
    WHERE id = p_campaign_id;

    -- Audit log
    INSERT INTO public.audit_logs (
      id, actor_id, actor, action, entity_type, entity_id, entity_label,
      after_state, metadata, idempotency_key
    ) VALUES (
      gen_random_uuid()::text, v_creator_id, 'creator',
      'campaign_payment_submitted', 'campaign', p_campaign_id::text,
      (SELECT title FROM public.campaigns WHERE id = p_campaign_id),
      jsonb_build_object('payment_status', 'submitted', 'utr', trim(p_utr_reference)),
      jsonb_build_object('campaign_budget_rupees', v_campaign_budget, 'platform_fee_paise', v_platform_fee_paise, 'total_payable_paise', v_total_payable_paise),
      'payment_submit_' || p_campaign_id::text || '_' || extract(epoch from now())::text
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'payment_status', v_payment.payment_status,
    'campaign_id', p_campaign_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_campaign_launch_payment(uuid, text) TO authenticated;

-- ── 6. Verify campaign launch payment (Admin) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.verify_campaign_launch_payment(
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_payment record;
  v_campaign_id uuid;
BEGIN
  -- Admin-only
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Get payment record
  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE id = p_payment_id;

  IF v_payment IS NULL THEN
    RAISE EXCEPTION 'Payment record not found';
  END IF;

  IF v_payment.payment_status != 'submitted' THEN
    RAISE EXCEPTION 'Payment is not in submitted status';
  END IF;

  v_campaign_id := v_payment.campaign_id;

  -- Verify the campaign is in draft status before opening
  -- Prevents reopening closed/paused/archived campaigns
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE id = v_campaign_id AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'Cannot verify payment: campaign is not in draft status';
  END IF;

  -- Update payment to verified
  UPDATE public.campaign_launch_payments
  SET
    payment_status = 'verified',
    verified_at = now(),
    verified_by = v_admin_id,
    updated_at = now()
  WHERE id = p_payment_id;

  -- Publish campaign: draft -> open
  UPDATE public.campaigns
  SET
    launch_payment_status = 'verified',
    status = 'open'
  WHERE id = v_campaign_id AND status = 'draft';

  -- If campaign was already open (shouldn't happen, but safety), just update payment status
  UPDATE public.campaigns
  SET launch_payment_status = 'verified'
  WHERE id = v_campaign_id AND status != 'draft';

  -- Audit log
  INSERT INTO public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id, entity_label,
    before_state, after_state, metadata, idempotency_key
  ) VALUES (
    gen_random_uuid()::text, v_admin_id, 'admin',
    'campaign_payment_verified', 'campaign', v_campaign_id::text,
    (SELECT title FROM public.campaigns WHERE id = v_campaign_id),
    jsonb_build_object('payment_status', 'submitted'),
    jsonb_build_object('payment_status', 'verified', 'campaign_status', 'open'),
    jsonb_build_object('utr', v_payment.utr_reference, 'total_payable_paise', v_payment.total_payable_paise),
    'payment_verify_' || p_payment_id::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'payment_status', 'verified',
    'campaign_id', v_campaign_id,
    'campaign_status', 'open'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_campaign_launch_payment(uuid) TO authenticated;

-- ── 7. Reject campaign launch payment (Admin) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_campaign_launch_payment(
  p_payment_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_payment record;
  v_campaign_id uuid;
BEGIN
  -- Admin-only
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Get payment record
  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE id = p_payment_id;

  IF v_payment IS NULL THEN
    RAISE EXCEPTION 'Payment record not found';
  END IF;

  IF v_payment.payment_status != 'submitted' THEN
    RAISE EXCEPTION 'Payment is not in submitted status';
  END IF;

  v_campaign_id := v_payment.campaign_id;

  -- Validate campaign is in draft status (prevents rejecting payment for an
  -- already-open campaign, which would be an inconsistent state)
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE id = v_campaign_id AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'Cannot reject payment: campaign is not in draft status';
  END IF;

  -- Update payment to rejected
  UPDATE public.campaign_launch_payments
  SET
    payment_status = 'rejected',
    rejection_reason = p_reason,
    rejected_at = now(),
    rejected_by = v_admin_id,
    updated_at = now()
  WHERE id = p_payment_id;

  -- Update campaign payment status
  UPDATE public.campaigns
  SET launch_payment_status = 'rejected'
  WHERE id = v_campaign_id;

  -- Audit log
  INSERT INTO public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id, entity_label,
    before_state, after_state, metadata, reason, idempotency_key
  ) VALUES (
    gen_random_uuid()::text, v_admin_id, 'admin',
    'campaign_payment_rejected', 'campaign', v_campaign_id::text,
    (SELECT title FROM public.campaigns WHERE id = v_campaign_id),
    jsonb_build_object('payment_status', 'submitted'),
    jsonb_build_object('payment_status', 'rejected'),
    jsonb_build_object('utr', v_payment.utr_reference),
    p_reason,
    'payment_reject_' || p_payment_id::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'payment_status', 'rejected',
    'campaign_id', v_campaign_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_campaign_launch_payment(uuid, text) TO authenticated;

-- ── 8. Get campaign launch payment (Creator + Admin) ───────────────────────

CREATE OR REPLACE FUNCTION public.get_campaign_launch_payment(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_build_object(
      'id', clp.id,
      'campaign_id', clp.campaign_id,
      'campaign_budget_rupees', clp.campaign_budget_rupees,
      'platform_fee_paise', clp.platform_fee_paise,
      'total_payable_paise', clp.total_payable_paise,
      'payment_status', clp.payment_status,
      'utr_reference', clp.utr_reference,
      'rejection_reason', clp.rejection_reason,
      'submitted_at', clp.submitted_at,
      'verified_at', clp.verified_at,
      'rejected_at', clp.rejected_at,
      'created_at', clp.created_at
    ),
    jsonb_build_object(
      'campaign_id', p_campaign_id,
      'payment_status', 'pending',
      'exists', false
    )
  )
  FROM public.campaign_launch_payments clp
  WHERE clp.campaign_id = p_campaign_id
    AND (
      clp.creator_id = auth.uid()
      OR public.is_admin()
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_launch_payment(uuid) TO authenticated;

-- ── 9. Get all campaign payments (Admin) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_all_campaign_launch_payments(
  p_status text DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', clp.id,
    'campaign_id', clp.campaign_id,
    'campaign_title', c.title,
    'campaign_budget_rupees', clp.campaign_budget_rupees,
    'platform_fee_paise', clp.platform_fee_paise,
    'total_payable_paise', clp.total_payable_paise,
    'payment_status', clp.payment_status,
    'utr_reference', clp.utr_reference,
    'rejection_reason', clp.rejection_reason,
    'submitted_at', clp.submitted_at,
    'verified_at', clp.verified_at,
    'rejected_at', clp.rejected_at,
    'creator_name', p.name,
    'creator_id', clp.creator_id,
    'campaign_status', c.status
  )
  FROM public.campaign_launch_payments clp
  JOIN public.campaigns c ON c.id = clp.campaign_id
  JOIN public.profiles p ON p.id = clp.creator_id
  WHERE public.is_admin()
    AND (p_status IS NULL OR clp.payment_status = p_status)
  ORDER BY clp.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_campaign_launch_payments(text) TO authenticated;

-- ── 10. Modify submit_clip to check launch payment ─────────────────────────

-- Drop and recreate submit_clip with launch payment check
CREATE OR REPLACE FUNCTION public.submit_clip(
  p_campaign_id uuid,
  p_caption text,
  p_video_url text,
  p_platform text default 'Instagram'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_clip_id uuid;
  v_campaign record;
  v_locked_cpm numeric;
  v_locked_max_payout numeric;
  v_budget_paise integer;
  v_existing_views integer;
  v_new_views bigint;
  v_engagement jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check clipper role
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND role = 'clipper' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active clippers can submit clips';
  END IF;

  -- Lock and fetch campaign
  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF v_campaign IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  -- Campaign must be open
  IF v_campaign.status != 'open' THEN
    RAISE EXCEPTION 'Campaign is not open for submissions';
  END IF;

  -- LAUNCH PAYMENT CHECK: campaign must have verified payment
  IF v_campaign.launch_payment_status != 'verified' THEN
    RAISE EXCEPTION 'Campaign launch payment has not been verified';
  END IF;

  -- Budget check: sum of committed + this clip's estimated earnings <= budget
  v_budget_paise := (v_campaign.budget * 100)::integer;
  SELECT COALESCE(sum(fr.gross_amount), 0) INTO v_existing_views
  FROM public.financial_records fr
  WHERE fr.campaign_id = p_campaign_id
    AND fr.status IN ('pending', 'processing');

  -- Duplicate URL check
  IF EXISTS (
    SELECT 1 FROM public.clips
    WHERE campaign_id = p_campaign_id AND video_url = p_video_url
  ) THEN
    RAISE EXCEPTION 'This URL has already been submitted to this campaign';
  END IF;

  -- Lock CPM from campaign
  v_locked_cpm := (v_campaign.payout * 100)::integer;
  v_locked_max_payout := CASE
    WHEN v_campaign.max_payout_per_clip IS NOT NULL
    THEN (v_campaign.max_payout_per_clip * 100)::integer
    ELSE NULL
  END;

  v_clip_id := gen_random_uuid();

  INSERT INTO public.clips (
    id, campaign_id, user_id, clipper, caption, video_url, platform,
    status, locked_cpm, locked_max_payout
  ) VALUES (
    v_clip_id, p_campaign_id, v_user_id,
    COALESCE((SELECT name FROM public.profiles WHERE id = v_user_id), 'Unknown'),
    p_caption, p_video_url, p_platform,
    'pending', v_locked_cpm, v_locked_max_payout
  );

  RETURN jsonb_build_object(
    'id', v_clip_id,
    'campaign_id', p_campaign_id,
    'status', 'pending'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_clip(uuid, text, text, text) TO authenticated;

-- ── 11. Modify create_campaign to set launch_payment_status ────────────────

-- Update create_campaign to set launch_payment_status = 'pending' for open campaigns
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
  p_rights jsonb default null,
  p_status text default 'open'
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
  v_launch_payment_status text;
BEGIN
  -- Only draft or open
  IF p_status NOT IN ('draft', 'open') THEN
    RAISE EXCEPTION 'Status must be draft or open';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, status INTO v_role, v_status
  FROM public.profiles WHERE id = v_user_id;

  IF v_role IS DISTINCT FROM 'creator' OR v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Only active creators can create campaigns';
  END IF;

  -- If publishing directly (status = 'open'), require launch payment
  -- Set status to 'draft' and launch_payment_status to 'pending'
  -- The campaign will be published after payment verification
  IF p_status = 'open' THEN
    v_launch_payment_status := 'pending';
    p_status := 'draft';
  ELSE
    v_launch_payment_status := 'pending';
  END IF;

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
    p_status, v_launch_payment_status
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
    jsonb_build_object('status', p_status, 'budget', p_budget, 'launch_payment_status', v_launch_payment_status),
    'campaign_create_' || (v_campaign->>'id') || '_' || extract(epoch from now())::text
  );

  RETURN v_campaign;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_campaign(
  text, text, text, numeric, text, uuid, text, numeric, integer,
  text, text, text, jsonb, text, date, date, numeric, text,
  text, text, text, text, text, jsonb, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, jsonb, numeric, text, text, text, jsonb, text
) TO authenticated;

-- ── 12. Campaign visibility for clippers ───────────────────────────────────
-- The clipper campaigns page already filters by status = 'open' or 'near_budget'.
-- Since unpaid campaigns are 'draft', they won't appear.
-- The submit_clip RPC above also checks launch_payment_status = 'verified'.
-- Additional safety: create a view for clipper campaign discovery.

DROP VIEW IF EXISTS public.clipper_available_campaigns;
CREATE OR REPLACE VIEW public.clipper_available_campaigns AS
SELECT c.*
FROM public.campaigns c
WHERE c.status IN ('open', 'near_budget')
  AND c.launch_payment_status = 'verified';

-- ── 13. Admin: get pending campaign payments count ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_pending_campaign_payment_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.campaign_launch_payments
  WHERE payment_status = 'submitted';
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_campaign_payment_count() TO authenticated;
