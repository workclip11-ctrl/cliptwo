-- ============================================================================
-- LOCK DIRECT CAMPAIGN STATUS UPDATES
-- ============================================================================
-- Problem:
--   A Creator can directly UPDATE campaigns.status through a normal Supabase
--   UPDATE (RLS allows auth.uid() = created_by). Even on a legitimately
--   verified/open campaign, the Creator could arbitrarily set status to
--   'paused', 'closed', 'draft', etc., bypassing the state machine RPC.
--
-- Solution:
--   A BEFORE UPDATE trigger blocks any campaigns.status change unless:
--     1. The caller is an admin (is_admin()), OR
--     2. A transaction-scoped temp table _campaign_transition_signal exists,
--        created by a trusted SECURITY DEFINER function before the UPDATE.
--
-- Why temp table (not a GUC):
--   A client-controllable GUC (set_config) must NOT be the security boundary.
--   Any authenticated user can call set_config(). A temp table, by contrast,
--   can only be created by a function with CREATE privilege on pg_temp —
--   ordinary PostgREST connections lack this privilege. The SECURITY DEFINER
--   functions that create the signal also perform full authorization checks
--   (owner verification, active creator status, valid state transitions).
--
-- Trusted functions that create _campaign_transition_signal:
--   - campaign_action()         — owner lifecycle (pause/resume/close/reopen/publish)
--   - admin_campaign_action()   — admin lifecycle (pause/resume/close/reopen/archive)
--   - verify_campaign_launch_payment() — admin payment verification (draft → open)
--   - verify_cashfree_webhook() — Cashfree payment verification (draft → open)
--
-- Cashfree verification already creates _cf_verify_signal for the payment
-- integrity trigger. This migration adds _campaign_transition_signal to the
-- same function so the status protection trigger also passes.
--
-- Run AFTER: 20250101000002_cashfree_trigger_fix.sql
-- Safe to run multiple times (idempotent CREATE OR REPLACE).
-- =============================================================================

-- ── 1. Status protection trigger ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_campaign_status_protected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when status actually changes
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Admins may always transition status (existing admin RPCs handle authorization)
    IF public.is_admin() THEN
      RETURN NEW;
    END IF;

    -- Trusted SECURITY DEFINER functions create this temp table before updating.
    -- It signals that the transition was authorized by the function's own checks.
    -- PostgREST connections cannot CREATE in pg_temp, so this cannot be forged.
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = '_campaign_transition_signal'
        AND n.nspname LIKE 'pg_temp%'
    ) THEN
      RETURN NEW;
    END IF;

    -- Block: direct Creator UPDATE of campaign status
    RAISE EXCEPTION 'Campaign status cannot be changed directly. Use campaign_action().';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_campaign_status_protected ON public.campaigns;
CREATE TRIGGER enforce_campaign_status_protected
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_campaign_status_protected();


-- ── 2. Update campaign_action() to create transition signal ─────────────────
-- This is the owner lifecycle RPC: pause, resume, close, reopen, publish.
-- It already validates state transitions and owner authorization.
-- We add the temp table signal so the new trigger allows the UPDATE.

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

  -- Active creator enforcement: suspended/deactivated creators cannot perform mutations
  if not exists (
    select 1 from public.profiles
    where id = v_actor and role = 'creator' and status = 'active'
  ) then
    raise exception 'Only active creators can perform campaign actions';
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
      if v_campaign.launch_payment_status is distinct from 'verified' then
        raise exception 'Cannot resume: launch payment has not been verified (current payment status: %)', v_campaign.launch_payment_status;
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
      if v_campaign.launch_payment_status is distinct from 'verified' then
        raise exception 'Cannot reopen: launch payment has not been verified (current payment status: %)', v_campaign.launch_payment_status;
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

  -- Authorization marker for enforce_campaign_status_protected trigger.
  -- See campaign-launch-payment-integrity.sql for full security analysis
  -- on why temp tables in pg_temp cannot be forged by PostgREST connections.
  DROP TABLE IF EXISTS _campaign_transition_signal;
  CREATE TEMPORARY TABLE _campaign_transition_signal (id int) ON COMMIT DROP;

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

GRANT EXECUTE ON FUNCTION public.campaign_action(uuid, text, text) TO authenticated;


-- ── 3. Update admin_campaign_action() to create transition signal ───────────
-- Admin lifecycle RPC: pause, resume, close, reopen, archive.
-- Creates signal once at start; all UPDATEs in same transaction see it.

CREATE OR REPLACE FUNCTION public.admin_campaign_action(
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

  -- Authorization marker for enforce_campaign_status_protected trigger.
  DROP TABLE IF EXISTS _campaign_transition_signal;
  CREATE TEMPORARY TABLE _campaign_transition_signal (id int) ON COMMIT DROP;

  -- State transition validation: enforce valid status changes
  case p_action
    when 'pause' then
      if v_campaign.status != 'open' then
        raise exception 'Cannot pause: campaign must be open (current: %)', v_campaign.status;
      end if;
      update public.campaigns set status = 'paused' where id = p_campaign_id;
      v_new_status := 'paused';
    when 'resume' then
      if v_campaign.status != 'paused' then
        raise exception 'Cannot resume: campaign must be paused (current: %)', v_campaign.status;
      end if;
      if v_campaign.launch_payment_status is distinct from 'verified' then
        raise exception 'Cannot resume: launch payment has not been verified (current payment status: %)', v_campaign.launch_payment_status;
      end if;
      update public.campaigns set status = 'open' where id = p_campaign_id;
      v_new_status := 'open';
    when 'close' then
      if v_campaign.status not in ('open', 'paused') then
        raise exception 'Cannot close: campaign must be open or paused (current: %)', v_campaign.status;
      end if;
      update public.campaigns set status = 'closed' where id = p_campaign_id;
      v_new_status := 'closed';
    when 'reopen' then
      if v_campaign.status != 'closed' then
        raise exception 'Cannot reopen: campaign must be closed (current: %)', v_campaign.status;
      end if;
      if v_campaign.launch_payment_status is distinct from 'verified' then
        raise exception 'Cannot reopen: launch payment has not been verified (current payment status: %)', v_campaign.launch_payment_status;
      end if;
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


-- ── 4. Update verify_campaign_launch_payment() to create transition signal ──
-- Admin payment verification: draft → open (sets both columns atomically).
-- Creates signal before the status UPDATE so the trigger allows it.

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

  -- FINE-GRAINED PERMISSION CHECK
  IF NOT public.admin_has_perm('campaign.verify_payment') THEN
    RAISE EXCEPTION 'Missing permission: campaign.verify_payment';
  END IF;

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

  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE id = v_campaign_id AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'Cannot verify payment: campaign is not in draft status';
  END IF;

  UPDATE public.campaign_launch_payments
  SET
    payment_status = 'verified',
    verified_at = now(),
    verified_by = v_admin_id,
    updated_at = now()
  WHERE id = p_payment_id;

  -- Authorization marker for enforce_campaign_status_protected trigger.
  DROP TABLE IF EXISTS _campaign_transition_signal;
  CREATE TEMPORARY TABLE _campaign_transition_signal (id int) ON COMMIT DROP;

  UPDATE public.campaigns
  SET
    launch_payment_status = 'verified',
    status = 'open'
  WHERE id = v_campaign_id AND status = 'draft';

  UPDATE public.campaigns
  SET launch_payment_status = 'verified'
  WHERE id = v_campaign_id AND status != 'draft';

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


-- ── 5. Update verify_cashfree_webhook() to create transition signal ─────────
-- Cashfree webhook verification: draft → open.
-- Already creates _cf_verify_signal for the payment integrity trigger.
-- We add _campaign_transition_signal for the status protection trigger.

CREATE OR REPLACE FUNCTION public.verify_cashfree_webhook(
  p_cashfree_order_id text,
  p_cf_payment_id text,
  p_payment_amount_rupees numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
  v_expected_amount_rupees numeric;
BEGIN
  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE cashfree_order_id = p_cashfree_order_id
  FOR UPDATE;

  IF v_payment IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for order';
  END IF;

  IF v_payment.payment_status = 'verified' THEN
    RETURN jsonb_build_object(
      'success', true,
      'payment_id', v_payment.id,
      'payment_status', 'verified',
      'campaign_id', v_payment.campaign_id,
      'idempotent', true
    );
  END IF;

  IF v_payment.payment_status != 'submitted' THEN
    RAISE EXCEPTION 'Payment is not in submitted status';
  END IF;

  v_expected_amount_rupees := v_payment.total_payable_paise / 100.0;

  IF ABS(p_payment_amount_rupees - v_expected_amount_rupees) > 0.01 THEN
    UPDATE public.campaign_launch_payments
    SET
      payment_status = 'rejected',
      rejection_reason = 'Amount mismatch detected',
      cashfree_cf_payment_id = p_cf_payment_id,
      cashfree_order_status = 'FAILED',
      rejected_at = now(),
      updated_at = now()
    WHERE id = v_payment.id;

    UPDATE public.campaigns
    SET launch_payment_status = 'rejected'
    WHERE id = v_payment.campaign_id;

    INSERT INTO public.audit_logs (
      id, actor_id, actor, action, entity_type, entity_id, entity_label,
      before_state, after_state, metadata, reason, idempotency_key
    ) VALUES (
      gen_random_uuid()::text, NULL, 'system',
      'campaign_payment_rejected_amount_mismatch', 'campaign', v_payment.campaign_id::text,
      (SELECT title FROM public.campaigns WHERE id = v_payment.campaign_id),
      jsonb_build_object('payment_status', v_payment.payment_status),
      jsonb_build_object('payment_status', 'rejected'),
      jsonb_build_object('cashfree_order_id', p_cashfree_order_id, 'cf_payment_id', p_cf_payment_id),
      'Amount mismatch detected',
      'webhook_reject_' || p_cashfree_order_id
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Amount mismatch',
      'payment_id', v_payment.id
    );
  END IF;

  UPDATE public.campaign_launch_payments
  SET
    payment_status = 'verified',
    cashfree_cf_payment_id = p_cf_payment_id,
    cashfree_order_status = 'PAID',
    verified_at = now(),
    verified_by = NULL,
    updated_at = now()
  WHERE id = v_payment.id;

  -- Authorization marker for the enforce_campaign_launch_payment_integrity trigger.
  -- See campaign-launch-payment-integrity.sql for full security analysis.
  DROP TABLE IF EXISTS _cf_verify_signal;
  CREATE TEMPORARY TABLE _cf_verify_signal (id int) ON COMMIT DROP;

  -- Authorization marker for the enforce_campaign_status_protected trigger.
  DROP TABLE IF EXISTS _campaign_transition_signal;
  CREATE TEMPORARY TABLE _campaign_transition_signal (id int) ON COMMIT DROP;

  UPDATE public.campaigns
  SET
    launch_payment_status = 'verified',
    status = 'open'
  WHERE id = v_payment.campaign_id AND status = 'draft';

  UPDATE public.campaigns
  SET launch_payment_status = 'verified'
  WHERE id = v_payment.campaign_id AND status != 'draft';

  INSERT INTO public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id, entity_label,
    before_state, after_state, metadata, idempotency_key
  ) VALUES (
    gen_random_uuid()::text, NULL, 'system',
    'campaign_payment_verified_cashfree', 'campaign', v_payment.campaign_id::text,
    (SELECT title FROM public.campaigns WHERE id = v_payment.campaign_id),
    jsonb_build_object('payment_status', v_payment.payment_status),
    jsonb_build_object('payment_status', 'verified', 'campaign_status', 'open'),
    jsonb_build_object('cashfree_order_id', p_cashfree_order_id, 'cf_payment_id', p_cf_payment_id, 'total_payable_paise', v_payment.total_payable_paise),
    'webhook_verify_' || p_cashfree_order_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'payment_status', 'verified',
    'campaign_id', v_payment.campaign_id,
    'campaign_status', 'open'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_cashfree_webhook(text, text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_cashfree_webhook(text, text, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_cashfree_webhook(text, text, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cashfree_webhook(text, text, numeric) TO service_role;
