-- ============================================================================
-- ClipTwo: Admin earning verification gate
-- ============================================================================
-- Changes the earning lifecycle from:
--   pending -> processing automatically after metrics
-- to:
--   pending -> processing only after an authorized admin verifies the earning.
--
-- "processing" remains the internal state used by the existing wallet/payout
-- architecture and is displayed to clippers as Available.
-- ============================================================================

-- Metrics sync may calculate/update a pending earning, but must never release it.
CREATE OR REPLACE FUNCTION public.finalize_clip_earning(
  p_clip_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip record;
  v_record record;
  v_campaign record;
  v_verified_views integer;
  v_gross integer;
  v_platform_fee integer;
  v_net integer;
  v_max_payout integer;
  v_budget numeric;
  v_reserved numeric;
  v_new_total numeric;
  v_result jsonb;
BEGIN
  SELECT * INTO v_clip
  FROM public.clips
  WHERE id = p_clip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clip not found: %', p_clip_id;
  END IF;

  IF v_clip.status != 'approved' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_record
  FROM public.financial_records
  WHERE clip_id = p_clip_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_verified_views := COALESCE(v_clip.verified_views, 0);
  IF v_verified_views <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = v_clip.campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found: %', v_clip.campaign_id;
  END IF;

  v_gross := (v_verified_views * v_record.locked_cpm) / 1000;

  v_max_payout := v_record.locked_max_payout;
  IF v_max_payout IS NOT NULL
     AND v_max_payout > 0
     AND v_gross > v_max_payout THEN
    v_gross := v_max_payout;
  END IF;

  v_platform_fee := round(v_gross * 0.10)::integer;
  v_net := v_gross - v_platform_fee;

  -- Pending earnings still reserve campaign budget.
  v_budget := v_campaign.budget;
  IF v_budget IS NOT NULL AND v_budget > 0 THEN
    SELECT COALESCE(sum(gross_amount), 0)
    INTO v_reserved
    FROM public.financial_records
    WHERE campaign_id = v_clip.campaign_id
      AND status IN ('pending', 'processing')
      AND id != v_record.id;

    v_new_total := v_reserved + v_gross;
    IF v_new_total > (v_budget * 100) THEN
      RAISE EXCEPTION 'Campaign budget exceeded: reserved ₹% + new ₹% > budget ₹%',
        v_reserved / 100, v_gross / 100, v_budget;
    END IF;
  END IF;

  -- IMPORTANT: remain pending. Only verify_clip_earning() can release it.
  UPDATE public.financial_records
  SET
    verified_views = v_verified_views,
    gross_amount = v_gross,
    platform_fee = v_platform_fee,
    net_amount = v_net,
    audit = COALESCE(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'metrics_updated_pending_verification',
      'verified_views', v_verified_views,
      'gross', v_gross,
      'platform_fee', v_platform_fee,
      'net', v_net,
      'at', now()
    )
  WHERE id = v_record.id
  RETURNING to_jsonb(financial_records.*) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_clip_earning(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_clip_earning(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.finalize_clip_earning(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_clip_earning(uuid) TO service_role;


-- Admin-only release: pending earning -> available (processing).
CREATE OR REPLACE FUNCTION public.verify_clip_earning(
  p_clip_id uuid,
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record record;
  v_clip record;
  v_campaign record;
  v_reserved numeric;
  v_budget numeric;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can verify clip earnings';
  END IF;

  IF NOT public.admin_has_perm('finance.verify') THEN
    RAISE EXCEPTION 'Missing permission: finance.verify';
  END IF;

  SELECT * INTO v_record
  FROM public.financial_records
  WHERE clip_id = p_clip_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending earning found for clip';
  END IF;

  SELECT * INTO v_clip
  FROM public.clips
  WHERE id = p_clip_id
  FOR UPDATE;

  IF NOT FOUND OR v_clip.status != 'approved' THEN
    RAISE EXCEPTION 'Clip is not in an approved state';
  END IF;

  IF COALESCE(v_record.verified_views, 0) <= 0 THEN
    RAISE EXCEPTION 'Earning cannot be verified before verified views are available';
  END IF;

  IF COALESCE(v_record.net_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Earning cannot be verified with a zero or negative amount';
  END IF;

  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = v_record.campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  -- Re-check the complete non-paid budget reservation while holding the locks.
  v_budget := v_campaign.budget;
  IF v_budget IS NOT NULL AND v_budget > 0 THEN
    SELECT COALESCE(sum(gross_amount), 0)
    INTO v_reserved
    FROM public.financial_records
    WHERE campaign_id = v_record.campaign_id
      AND status IN ('pending', 'processing')
      AND id != v_record.id;

    IF v_reserved + v_record.gross_amount > (v_budget * 100) THEN
      RAISE EXCEPTION 'Campaign budget exceeded: reserved ₹% + earning ₹% > budget ₹%',
        v_reserved / 100, v_record.gross_amount / 100, v_budget;
    END IF;
  END IF;

  UPDATE public.financial_records
  SET
    status = 'processing',
    processing_at = now(),
    audit = COALESCE(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'earning_verified',
      'by', COALESCE(p_actor, (SELECT email FROM public.profiles WHERE id = auth.uid())),
      'verified_views', v_record.verified_views,
      'gross', v_record.gross_amount,
      'platform_fee', v_record.platform_fee,
      'net', v_record.net_amount,
      'at', now()
    )
  WHERE id = v_record.id
  RETURNING to_jsonb(financial_records.*) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_clip_earning(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_clip_earning(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.verify_clip_earning(uuid, text)
IS 'Admin verification gate: releases a pending clip earning to available/processing.';
