-- ============================================================================
-- FINANCE CONSOLIDATION MIGRATION
--
-- This migration completes the transition from the legacy financial architecture
-- (earnings, payouts, wallet_ledger-as-source-of-truth) to the new authoritative
-- architecture (financial_records, payout_requests).
--
-- Run AFTER: schema.sql, admin-schema.sql, financial-rewrite.sql
-- Run BEFORE: integrity-constraints.sql
--
-- Changes:
-- 1. update_clip_status: remove legacy financial columns and earnings creation
-- 2. admin_clip_action: restrict to moderation-only actions (approve/reject/hold)
-- 3. admin_user_action: reference financial_records/payout_requests for delete check
-- 4. adjust_campaign_budget: use financial_records instead of earnings
-- 5. clips.status CHECK: enforce moderation-only statuses
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Fix update_clip_status — remove legacy financial columns and earnings ref
--
-- This function is called by admin_clip_action for reject/hold operations.
-- Approve now goes through approve_clip() which creates financial_records.
-- We remove: failure_reason, txn_id, payout_ref parameters and the
-- earnings/create_earning block.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_clip_status(
  p_clip_id uuid,
  p_status text,
  p_rejection_reason text DEFAULT NULL,
  p_rejection_details text DEFAULT NULL,
  p_held_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip record;
  v_actor uuid;
  v_is_admin boolean;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_admin := public.is_admin();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can update clip status';
  END IF;

  -- Moderation-only statuses (financial state lives in financial_records)
  IF p_status NOT IN ('pending', 'approved', 'rejected', 'held') THEN
    RAISE EXCEPTION 'Invalid status: %. Only moderation statuses allowed.', p_status;
  END IF;

  SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clip not found';
  END IF;

  UPDATE public.clips SET
    status = p_status,
    rejection_reason = COALESCE(p_rejection_reason, rejection_reason),
    rejection_details = COALESCE(p_rejection_details, rejection_details),
    held_reason = COALESCE(p_held_reason, held_reason),
    updated_at = now(),
    audit = COALESCE(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'status_changed',
      'by', (SELECT email FROM public.profiles WHERE id = v_actor),
      'at', now(),
      'from', v_clip.status,
      'to', p_status
    )
  WHERE id = p_clip_id
  RETURNING to_jsonb(clips.*) INTO v_clip;

  -- NOTE: Financial record creation for approved clips is handled by approve_clip().
  -- This function only handles moderation status changes (reject, hold).

  RETURN v_clip;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_clip_status(uuid, text, text, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Fix admin_clip_action — restrict to moderation-only actions
--
-- Financial actions (payable, processing, paid, failed, retry, release, revert)
-- are removed. Clip approval goes through approve_clip() which creates
-- financial_records atomically. This function now only handles:
--   approve → sets clip to approved (caller should also call approve_clip)
--   reject  → sets clip to rejected
--   hold    → sets clip to held
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_clip_action(
  p_clip_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_details text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_clip record;
  v_new_status text;
  v_old_status text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can perform clip actions'; END IF;

  -- Moderation-only actions (financial lifecycle is in financial_records)
  IF p_action NOT IN ('approve', 'reject', 'hold') THEN
    RAISE EXCEPTION 'Invalid action: %. Only approve, reject, hold are allowed.', p_action;
  END IF;

  SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clip not found'; END IF;
  v_old_status := v_clip.status;

  v_new_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'hold' THEN 'held'
  END;

  PERFORM public.update_clip_status(
    p_clip_id, v_new_status,
    CASE WHEN p_action = 'reject' THEN p_reason ELSE NULL END,
    CASE WHEN p_action = 'reject' THEN p_details ELSE NULL END,
    CASE WHEN p_action = 'hold' THEN p_reason ELSE NULL END
  );

  PERFORM public.write_admin_audit(
    'clip_' || p_action, 'clip', p_clip_id::text,
    COALESCE(v_clip.caption, p_clip_id::text),
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', v_new_status),
    jsonb_build_object('reason', p_reason, 'action', p_action),
    'clip-' || p_clip_id::text || '-' || p_action
  );

  SELECT to_jsonb(c.*) INTO v_clip FROM public.clips c WHERE id = p_clip_id;
  RETURN jsonb_build_object('success', true, 'clip', v_clip, 'action', p_action, 'from', v_old_status, 'to', v_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clip_action(uuid, text, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Fix admin_user_action — reference financial_records/payout_requests
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_user_action(
  p_user_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_details text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_profile record;
  v_old_status text;
  v_new_value text;
  v_financial_count integer;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can perform user actions'; END IF;

  IF p_action NOT IN ('suspend', 'reactivate', 'verify', 'unverify', 'set_risk', 'clear_risk', 'save_notes', 'deactivate', 'delete') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  v_old_status := v_profile.status;

  CASE p_action
    WHEN 'suspend' THEN
      UPDATE public.profiles SET status = 'suspended', suspended_reason = p_reason WHERE id = p_user_id;
      v_new_value := 'suspended';

    WHEN 'reactivate' THEN
      UPDATE public.profiles SET status = 'active', suspended_reason = NULL WHERE id = p_user_id;
      v_new_value := 'active';

    WHEN 'verify' THEN
      UPDATE public.profiles SET verified = true, verified_at = now() WHERE id = p_user_id;
      v_new_value := 'verified';

    WHEN 'unverify' THEN
      UPDATE public.profiles SET verified = false, verified_at = NULL WHERE id = p_user_id;
      v_new_value := 'unverified';

    WHEN 'set_risk' THEN
      UPDATE public.profiles SET risk_flag = true, risk_note = p_reason WHERE id = p_user_id;
      v_new_value := 'risk_flagged';

    WHEN 'clear_risk' THEN
      UPDATE public.profiles SET risk_flag = false, risk_note = NULL WHERE id = p_user_id;
      v_new_value := 'risk_cleared';

    WHEN 'save_notes' THEN
      UPDATE public.profiles SET admin_notes = p_details WHERE id = p_user_id;
      v_new_value := 'notes_saved';

    WHEN 'deactivate' THEN
      UPDATE public.profiles SET
        status = 'deactivated',
        deactivated_at = now(),
        deactivated_by = v_actor
      WHERE id = p_user_id;

      -- Ban auth account
      UPDATE auth.users SET banned_until = 'infinity' WHERE id = p_user_id;

      DELETE FROM public.social_connections WHERE user_id = p_user_id;
      DELETE FROM public.social_accounts WHERE user_id = p_user_id;
      DELETE FROM public.social_oauth_states WHERE user_id = p_user_id;

      v_new_value := 'deactivated';

    -- DELETE: Hard-delete from auth.users (cascades to profiles, clips, etc.)
    -- Only allowed when NO financial records exist.
    WHEN 'delete' THEN
      -- Check for financial records that would be orphaned or lost
      SELECT count(*) INTO v_financial_count
      FROM (
        SELECT 1 FROM public.wallet_ledger WHERE user_id = p_user_id
        UNION ALL
        SELECT 1 FROM public.payout_requests WHERE user_id = p_user_id
        UNION ALL
        SELECT 1 FROM public.financial_records WHERE clipper_id = p_user_id
      ) financial;

      IF v_financial_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete user with % financial records. Use deactivate instead.', v_financial_count;
      END IF;

      DELETE FROM public.social_connections WHERE user_id = p_user_id;
      DELETE FROM public.social_accounts WHERE user_id = p_user_id;
      DELETE FROM public.social_oauth_states WHERE user_id = p_user_id;

      DELETE FROM auth.users WHERE id = p_user_id;

      v_new_value := 'deleted';
  END CASE;

  PERFORM public.write_admin_audit(
    'user_' || p_action, 'user', p_user_id::text,
    COALESCE(v_profile.name, v_profile.email, p_user_id::text),
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', v_new_value),
    jsonb_build_object('reason', p_reason, 'action', p_action),
    'user-' || p_user_id::text || '-' || p_action
  );

  RETURN jsonb_build_object('success', true, 'action', p_action, 'user_id', p_user_id, 'to', v_new_value);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_user_action(uuid, text, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Fix adjust_campaign_budget — use financial_records instead of earnings
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.adjust_campaign_budget(
  p_campaign_id uuid,
  p_new_budget numeric,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_campaign record;
  v_current_spend numeric;
  v_old_budget numeric;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.campaigns WHERE id = p_campaign_id AND created_by = v_actor
  ) THEN
    RAISE EXCEPTION 'Not authorized to adjust this campaign budget';
  END IF;

  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  IF p_new_budget < 0 THEN
    RAISE EXCEPTION 'Budget cannot be negative';
  END IF;

  -- Calculate current committed spend from financial_records (net_amount)
  -- reserved = sum of net_amount where status in ('pending','processing','paid')
  SELECT COALESCE(SUM(net_amount), 0) INTO v_current_spend
  FROM public.financial_records
  WHERE campaign_id = p_campaign_id AND status IN ('pending', 'processing', 'paid');

  IF p_new_budget < v_current_spend THEN
    RAISE EXCEPTION 'Budget (₹%) cannot be lower than committed/spent amount (₹%)', p_new_budget, v_current_spend;
  END IF;

  v_old_budget := v_campaign.budget;

  UPDATE public.campaigns SET budget = p_new_budget WHERE id = p_campaign_id;

  -- Write audit log
  INSERT INTO public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id, entity_label,
    before_state, after_state, metadata, idempotency_key
  ) VALUES (
    'audit-' || extract(epoch from now())::bigint || '-' || upper(md5(random()::text)),
    v_actor,
    COALESCE((SELECT email FROM public.profiles WHERE id = v_actor), 'unknown'),
    'campaign_budget_adjusted',
    'campaign',
    p_campaign_id::text,
    v_campaign.title,
    jsonb_build_object('budget', v_old_budget),
    jsonb_build_object('budget', p_new_budget),
    jsonb_build_object('reason', p_reason, 'old_budget', v_old_budget, 'new_budget', p_new_budget, 'current_spend', v_current_spend, 'actor_type', 'owner'),
    'budget-' || p_campaign_id::text || '-' || extract(epoch from now())::bigint
  );

  RETURN jsonb_build_object('success', true, 'budget', p_new_budget, 'previous', v_old_budget);
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_campaign_budget(uuid, numeric, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Fix clips.status CHECK — enforce moderation-only statuses
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS clips_status_check;
  ALTER TABLE public.clips ADD CONSTRAINT clips_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'held'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
