-- =============================================================================
-- SECURITY HARDENING MIGRATION
--
-- Run AFTER: schema.sql, admin-schema.sql, financial-rewrite.sql,
--            finance-consolidation.sql, integrity-constraints.sql,
--            campaign-launch-payments.sql, phase7a-lock-service-rpcs.sql
--
-- Addresses:
--   PART 2:  Admin fine-grained permission checks on all admin RPCs
--   PART 3:  Payout lifecycle fix (records not marked paid until UTR confirmed)
--   PART 4:  get_wallet_balance authorization check (self or admin)
--   PART 5:  Campaign launch payment RPCs — add admin_has_perm checks
--   PART 6:  Account enforcement on profile reads
--   PART 7:  Notifications — restrict INSERT to admin/system only
--   PART 8:  Audit logs — append-only trigger enforcement
--   PART 9:  OAuth redirect — validateRedirectPath hardened (backslash, control chars)
--   PART 10: Storage — campaign-assets RLS already correct (no change)
--   PART 11: Token key validation — exact 64-hex-char regex enforced
--   PART 14: Fix EXCEPTION WHEN OTHERS THEN NULL silent failures
--   PART 15: Verify service-only RPC regression protection
--   Round 2: approve_clip requires clip.approve permission
--   Round 2: get_campaign_budget requires authorization (campaign owner or admin)
--   Round 2: complete_payout_request adds SELECT FOR UPDATE + amount consistency
--   Round 2: submit_campaign_launch_payment requires active creator status
--   Round 2: enforce_profile_field_permissions uses fine-grained admin_has_perm()
--   Round 2: Regression test suite strengthened (66 tests total)
--   Round 3: complete_payout_request adds full record ownership validation
--   Round 3: request_payout no longer marks records paid (lifecycle fix)
--   Round 3: campaign_action requires active creator status
--   Round 3: adjust_campaign_budget requires active creator status
--   Round 3: get_wallet_balance consolidated to one authoritative definition
--
-- Safety: All functions use CREATE OR REPLACE. All constraints use
--         IF NOT EXISTS / exception handling. Safe to re-run.
-- =============================================================================


-- =============================================================================
-- PART 2: ADMIN FINE-GRAINED PERMISSION CHECKS
--
-- The finance-consolidation.sql overwrites admin_clip_action and
-- admin_user_action, losing the admin_has_perm() checks from admin-schema.sql.
-- We restore them here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2a. admin_clip_action — restore fine-grained permission checks
-- Actions: reject, hold (approval goes through approve_clip)
-- ---------------------------------------------------------------------------
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
  v_perm text;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can perform clip actions'; END IF;

  IF p_action NOT IN ('reject', 'hold') THEN
    RAISE EXCEPTION 'Invalid action: %. Only reject and hold are allowed. Use approve_clip() for approval.', p_action;
  END IF;

  -- FINE-GRAINED PERMISSION CHECK (restored from admin-schema.sql)
  v_perm := 'clip.' || p_action;
  IF NOT public.admin_has_perm(v_perm) THEN
    RAISE EXCEPTION 'Missing permission: %', v_perm;
  END IF;

  SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clip not found'; END IF;
  v_old_status := v_clip.status;

  v_new_status := CASE p_action
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

-- ---------------------------------------------------------------------------
-- 2b. admin_user_action — restore fine-grained permission checks
-- Actions: suspend, reactivate, verify, unverify, set_risk, clear_risk,
--          save_notes, deactivate, delete
-- ---------------------------------------------------------------------------
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
  v_perm text;
  v_financial_count integer;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can perform user actions'; END IF;

  IF p_action NOT IN ('suspend', 'reactivate', 'verify', 'unverify', 'set_risk', 'clear_risk', 'save_notes', 'deactivate', 'delete') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  -- FINE-GRAINED PERMISSION CHECK (restored from admin-schema.sql)
  v_perm := 'clipper.' || p_action;
  IF p_action IN ('verify', 'unverify') THEN v_perm := 'clipper.verify'; END IF;
  IF p_action IN ('set_risk', 'clear_risk') THEN v_perm := 'clipper.risk'; END IF;
  IF p_action = 'save_notes' THEN v_perm := 'clipper.notes'; END IF;
  IF p_action IN ('deactivate', 'delete') THEN v_perm := 'clipper.delete'; END IF;

  IF NOT public.admin_has_perm(v_perm) THEN
    RAISE EXCEPTION 'Missing permission: %', v_perm;
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
      UPDATE auth.users SET banned_until = 'infinity' WHERE id = p_user_id;
      DELETE FROM public.social_connections WHERE user_id = p_user_id;
      DELETE FROM public.social_accounts WHERE user_id = p_user_id;
      DELETE FROM public.social_oauth_states WHERE user_id = p_user_id;
      v_new_value := 'deactivated';
    WHEN 'delete' THEN
      SELECT count(*) INTO v_financial_count
      FROM (
        SELECT 1 FROM public.financial_records WHERE clipper_id = p_user_id
        UNION ALL
        SELECT 1 FROM public.payout_requests WHERE user_id = p_user_id
        UNION ALL
        SELECT 1 FROM public.wallet_ledger WHERE user_id = p_user_id
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

-- ---------------------------------------------------------------------------
-- 2c. process_payout_request — add admin_has_perm check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_payout_request(
  p_payout_id uuid,
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can process payout requests';
  END IF;

  -- FINE-GRAINED PERMISSION CHECK
  IF NOT public.admin_has_perm('payout.process') THEN
    RAISE EXCEPTION 'Missing permission: payout.process';
  END IF;

  UPDATE public.payout_requests SET
    status = 'processing',
    processing_at = now(),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'processing',
      'by', coalesce(p_actor, (SELECT email FROM public.profiles WHERE id = auth.uid())),
      'at', now()
    )
  WHERE id = p_payout_id AND status = 'pending'
  RETURNING to_jsonb(payout_requests.*) INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Payout request not found or not in pending status';
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_payout_request(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2d. complete_payout_request — add admin_has_perm check + mark records paid
-- This is also the PART 3 fix: financial_records are now marked 'paid' ONLY
-- when the admin confirms UPI payment with UTR, not at request time.
-- Enhanced with full record ownership validation and concurrency protection.
--
-- CONCURRENCY SAFETY:
-- 1. Acquires the same per-user advisory lock as request_payout() to prevent
--    races between request creation and completion.
-- 2. Locks the payout row with FOR UPDATE.
-- 3. Locks ALL referenced financial_records with FOR UPDATE to prevent
--    concurrent modification by request_payout() or another complete call.
-- 4. Validates uniqueness of finance_record_ids (no duplicates).
-- 5. Validates ownership, status, and no other payout association.
-- 6. Validates amount matches exactly.
-- 7. Marks payout and records paid atomically.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_payout_request(
  p_payout_id uuid,
  p_payment_reference text DEFAULT NULL,
  p_actor text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout record;
  v_result jsonb;
  v_total_payable integer;
  v_invalid_record record;
  v_record_ids uuid[];
  v_user_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can complete payout requests';
  END IF;

  -- FINE-GRAINED PERMISSION CHECK
  IF NOT public.admin_has_perm('payout.complete') THEN
    RAISE EXCEPTION 'Missing permission: payout.complete';
  END IF;

  -- 1. Lock the payout row to prevent concurrent processing
  SELECT * INTO v_payout
  FROM public.payout_requests
  WHERE id = p_payout_id AND status = 'processing'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout request not found or not in processing status';
  END IF;

  -- 2. Acquire per-user advisory lock to coordinate with request_payout()
  -- This prevents races between request creation and completion
  v_user_id := v_payout.user_id;
  IF NOT pg_try_advisory_xact_lock(
    ('x' || md5(v_user_id::text))::bit(64)::bigint
  ) THEN
    RAISE EXCEPTION 'Another payout operation is in progress for this user. Please try again.';
  END IF;

  -- 3. Require UPI transaction reference before marking as paid
  IF p_payment_reference IS NULL OR trim(p_payment_reference) = '' THEN
    RAISE EXCEPTION 'UPI transaction reference (UTR) is required before marking payout as paid.';
  END IF;

  -- 4. Require a valid, non-empty finance-record ID list
  IF v_payout.finance_record_ids IS NULL OR array_length(v_payout.finance_record_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Payout has no associated financial records';
  END IF;

  -- 5. Validate uniqueness of finance_record_ids (no duplicates allowed)
  -- Duplicate IDs would cause ambiguous amount calculation
  v_record_ids := v_payout.finance_record_ids;
  IF array_length(v_record_ids, 1) != array_length(array(SELECT DISTINCT unnest FROM unnest(v_record_ids)), 1) THEN
    RAISE EXCEPTION 'Payout contains duplicate financial record IDs';
  END IF;

  -- 6. Lock ALL referenced financial_records with FOR UPDATE
  -- This prevents concurrent modification by request_payout() or another complete call
  -- We lock them first, then validate in a separate query
  PERFORM 1
  FROM public.financial_records fr
  WHERE fr.id = ANY(v_record_ids)
  FOR UPDATE;

  -- 7. Validate ALL referenced financial records atomically
  -- Check each record for: ownership, status, and no other payout association
  SELECT fr.id, fr.clipper_id, fr.status, fr.net_amount
  INTO v_invalid_record
  FROM public.financial_records fr
  WHERE fr.id = ANY(v_record_ids)
    AND (
      -- Record must belong to the payout user
      fr.clipper_id != v_payout.user_id
      -- Record must be in processing state
      OR fr.status != 'processing'
      -- Record must not be already referenced by another payout
      OR EXISTS (
        SELECT 1 FROM public.payout_requests pr2
        WHERE pr2.id != p_payout_id
          AND pr2.status IN ('pending', 'processing', 'paid')
          AND fr.id = ANY(pr2.finance_record_ids)
      )
    )
  LIMIT 1;

  IF FOUND THEN
    IF v_invalid_record.clipper_id != v_payout.user_id THEN
      RAISE EXCEPTION 'Financial record % belongs to user %, not payout user %',
        v_invalid_record.id, v_invalid_record.clipper_id, v_payout.user_id;
    ELSIF v_invalid_record.status != 'processing' THEN
      RAISE EXCEPTION 'Financial record % has status %, expected processing',
        v_invalid_record.id, v_invalid_record.status;
    ELSE
      RAISE EXCEPTION 'Financial record % is already referenced by another payout',
        v_invalid_record.id;
    END IF;
  END IF;

  -- 8. Verify the sum of eligible records exactly equals the payout amount
  SELECT coalesce(sum(net_amount), 0) INTO v_total_payable
  FROM public.financial_records
  WHERE id = ANY(v_record_ids)
    AND clipper_id = v_payout.user_id
    AND status = 'processing';

  IF v_total_payable != v_payout.net_amount THEN
    RAISE EXCEPTION 'Amount mismatch: payout claims ₹% but validated records total ₹%',
      v_payout.net_amount, v_total_payable;
  END IF;

  -- 9. Mark payout as paid
  UPDATE public.payout_requests SET
    status = 'paid',
    payment_reference = coalesce(p_payment_reference, payment_reference),
    paid_by = auth.uid(),
    paid_at = now(),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'paid',
      'by', coalesce(p_actor, (SELECT email FROM public.profiles WHERE id = auth.uid())),
      'at', now(),
      'payment_reference', p_payment_reference
    )
  WHERE id = p_payout_id AND status = 'processing'
  RETURNING to_jsonb(payout_requests.*) INTO v_result;

  -- 10. Mark ONLY the validated records paid
  UPDATE public.financial_records SET
    status = 'paid',
    paid_at = now(),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'paid_by_payout',
      'payout_id', p_payout_id,
      'payment_reference', p_payment_reference,
      'at', now()
    )
  WHERE id = ANY(v_record_ids)
    AND clipper_id = v_payout.user_id
    AND status = 'processing';

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_payout_request(uuid, text, text) TO authenticated;


-- =============================================================================
-- PART 3: FIX PAYOUT LIFECYCLE — request_payout() no longer marks records paid
--
-- BUG: request_payout() was marking financial_records as 'paid' immediately
-- upon payout request creation, before actual UPI transfer. This permanently
-- consumed the records even if the admin never processed the payout.
--
-- FIX: request_payout() now ONLY creates the payout_request. Financial records
-- stay as 'processing'. The wallet balance formula already correctly subtracts
-- pending/processing payout_requests from the processing records sum.
-- Records are marked 'paid' ONLY in complete_payout_request() when admin
-- confirms actual UPI transfer with UTR.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.request_payout()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_balance integer;
  v_upi text;
  v_payout_id uuid;
  v_result jsonb;
  v_pending_count integer;
  v_record_ids uuid[];
  v_record_sum integer;
  v_excluded_ids uuid[];
BEGIN
  -- 1. Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Advisory lock: serialize payout requests per user
  IF NOT pg_try_advisory_xact_lock(
    ('x' || md5(v_user_id::text))::bit(64)::bigint
  ) THEN
    RAISE EXCEPTION 'Another payout request is being processed. Please try again.';
  END IF;

  -- 3. Verify active account
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Account is not active';
  END IF;

  -- 4. Read verified UPI
  SELECT upi INTO v_upi
  FROM public.profiles
  WHERE id = v_user_id AND status = 'active';

  IF v_upi IS NULL OR trim(v_upi) = '' THEN
    RAISE EXCEPTION 'No verified UPI ID on file. Add a UPI ID in Settings first.';
  END IF;

  -- 5. Check no pending/processing payout exists (inside lock)
  SELECT count(*) INTO v_pending_count
  FROM public.payout_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'processing');

  IF v_pending_count > 0 THEN
    RAISE EXCEPTION 'A payout request is already in progress. Please wait for it to complete.';
  END IF;

  -- 6. Calculate available balance
  -- Available = sum(processing records) - sum(pending/processing payout requests)
  -- IMPORTANT: Records stay 'processing' until complete_payout_request() confirms UTR.
  SELECT coalesce(sum(net_amount), 0) INTO v_balance
  FROM public.financial_records
  WHERE clipper_id = v_user_id AND status = 'processing';

  v_balance := v_balance - coalesce((
    SELECT coalesce(sum(net_amount), 0)
    FROM public.payout_requests
    WHERE user_id = v_user_id AND status IN ('pending', 'processing')
  ), 0);

  -- 7. Enforce minimum ₹100 (10000 paise)
  IF v_balance < 10000 THEN
    RAISE EXCEPTION 'Minimum withdrawal is ₹100. Current available: ₹%', v_balance / 100;
  END IF;

  -- 8. Get the processing finance record IDs that will be covered
  -- First, get record IDs already referenced by existing payout requests (read-only)
  SELECT coalesce(array_agg(unnest), '{}')
  INTO v_excluded_ids
  FROM public.payout_requests,
  unnest(finance_record_ids)
  WHERE user_id = v_user_id;

  -- Lock and select eligible records with FOR UPDATE to prevent concurrent modification
  -- This ensures selected records cannot be changed between selection and payout creation
  SELECT array_agg(fr.id), coalesce(sum(fr.net_amount), 0)
  INTO v_record_ids, v_record_sum
  FROM public.financial_records fr
  WHERE fr.clipper_id = v_user_id AND fr.status = 'processing'
    AND fr.id <> ALL(v_excluded_ids)
  FOR UPDATE;

  -- 9. Validate: payout amount must equal sum of referenced records
  IF v_record_sum != v_balance THEN
    RAISE EXCEPTION 'Balance mismatch: calculated ₹% but records total ₹%', v_balance, v_record_sum;
  END IF;

  IF v_record_ids IS NULL OR array_length(v_record_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No eligible financial records for payout';
  END IF;

  -- 10. Create payout request (inside advisory lock)
  --     Financial records REMAIN 'processing' — they are NOT marked 'paid' yet.
  --     The payout_request reserves them via the balance subtraction formula.
  INSERT INTO public.payout_requests (
    user_id, amount, net_amount, currency, status, method, upi_id,
    finance_record_ids, audit
  ) VALUES (
    v_user_id, v_balance, v_balance, 'INR', 'pending', 'upi', v_upi,
    v_record_ids,
    jsonb_build_object(
      'action', 'requested',
      'by', (SELECT email FROM public.profiles WHERE id = v_user_id),
      'at', now(),
      'record_count', array_length(v_record_ids, 1)
    )
  )
  RETURNING id INTO v_payout_id;

  -- NOTE: Financial records stay as 'processing'. They are marked 'paid' ONLY
  -- in complete_payout_request() when admin confirms actual UPI transfer with UTR.

  -- Return the payout record
  SELECT to_jsonb(pr.*) INTO v_result
  FROM public.payout_requests pr
  WHERE id = v_payout_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_payout() TO authenticated;


-- =============================================================================
-- PART 5: CAMPAIGN LAUNCH PAYMENT RPCs — add admin_has_perm checks
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5a. verify_campaign_launch_payment — add permission check
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5b. reject_campaign_launch_payment — add permission check
-- ---------------------------------------------------------------------------
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
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- FINE-GRAINED PERMISSION CHECK
  IF NOT public.admin_has_perm('campaign.reject_payment') THEN
    RAISE EXCEPTION 'Missing permission: campaign.reject_payment';
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
    RAISE EXCEPTION 'Cannot reject payment: campaign is not in draft status';
  END IF;

  UPDATE public.campaign_launch_payments
  SET
    payment_status = 'rejected',
    rejection_reason = p_reason,
    rejected_at = now(),
    rejected_by = v_admin_id,
    updated_at = now()
  WHERE id = p_payment_id;

  UPDATE public.campaigns
  SET launch_payment_status = 'rejected'
  WHERE id = v_campaign_id;

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


-- =============================================================================
-- PART 7: NOTIFICATIONS — restrict INSERT to admin/system only
--
-- Current: notifications INSERT allows auth.uid() = user_id OR is_admin()
-- Problem: Any user can create notifications for themselves (fake notifications)
-- Fix: INSERT restricted to admin only. System notifications created by RPCs.
-- =============================================================================

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (public.is_admin());


-- =============================================================================
-- PART 8: AUDIT LOGS — append-only trigger enforcement
--
-- Current: RLS allows admin INSERT, but no DB-level append-only enforcement.
-- Problem: An admin with SQL access could UPDATE or DELETE audit entries.
-- Fix: BEFORE UPDATE/DELETE trigger that ALWAYS raises exception.
-- =============================================================================

-- Ensure UPDATE is blocked at the trigger level (defense-in-depth with RLS)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. UPDATE is not allowed.';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_update ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_modification();

-- Ensure DELETE is blocked at the trigger level
CREATE OR REPLACE FUNCTION public.prevent_audit_log_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable. DELETE is not allowed.';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_delete ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_deletion();


-- =============================================================================
-- PART 14: FIX SILENT MIGRATION FAILURES
--
-- integrity-constraints.sql uses EXCEPTION WHEN OTHERS THEN NULL which
-- silently swallows ALL errors, including actual constraint violations.
-- Fix: replace with specific exception types.
-- =============================================================================

-- NOTE: The double-semicolon ($$;;) issue and silent error swallowing are in
-- integrity-constraints.sql lines 26, 32. These backfill UPDATE statements
-- silently fail if the target table doesn't exist or has wrong schema.
-- We cannot retroactively fix those (they already ran), but we document the
-- pattern and ensure future migrations use specific exception types.

-- Verify: re-run the critical constraints from integrity-constraints.sql with
-- proper error handling. These are idempotent DO blocks.

-- profiles: role and status CHECK
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('clipper', 'creator', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check
    CHECK (status IN ('active', 'suspended', 'deactivated'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- campaigns: status, non-negative amounts
DO $$ BEGIN
  ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check_v2
    CHECK (status IN ('open', 'closed', 'draft', 'paused', 'archived', 'budget_reached', 'near_budget'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- financial_records: status CHECK
DO $$ BEGIN
  ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_status_check
    CHECK (status IN ('pending', 'processing', 'paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- payout_requests: status CHECK
DO $$ BEGIN
  ALTER TABLE public.payout_requests DROP CONSTRAINT IF EXISTS payout_requests_status_check;
  ALTER TABLE public.payout_requests ADD CONSTRAINT payout_requests_status_check
    CHECK (status IN ('pending', 'processing', 'paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- PART 15: VERIFY SERVICE-ONLY RPC REGRESSION PROTECTION
--
-- The 5 service-only RPCs must remain REVOKE'd from PUBLIC/anon/authenticated
-- and GRANT'd only to service_role. This section re-applies the locks
-- to prevent any migration from accidentally re-granting access.
-- =============================================================================

-- ingest_clip_metrics
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) FROM PUBLIC;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- finalize_clip_earning
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.finalize_clip_earning(uuid) FROM PUBLIC;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.finalize_clip_earning(uuid) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.finalize_clip_earning(uuid) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.finalize_clip_earning(uuid) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- acquire_sync_lock
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.acquire_sync_lock(text, uuid, integer) FROM PUBLIC;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.acquire_sync_lock(text, uuid, integer) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.acquire_sync_lock(text, uuid, integer) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.acquire_sync_lock(text, uuid, integer) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- release_sync_lock
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.release_sync_lock(text, uuid) FROM PUBLIC;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.release_sync_lock(text, uuid) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.release_sync_lock(text, uuid) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.release_sync_lock(text, uuid) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- renew_sync_lock
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.renew_sync_lock(text, uuid, integer) FROM PUBLIC;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.renew_sync_lock(text, uuid, integer) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.renew_sync_lock(text, uuid, integer) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.renew_sync_lock(text, uuid, integer) TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;


-- =============================================================================
-- PART 16: REVOKE DIRECT TABLE WRITES WHERE RPC-only
--
-- Several tables should only be modified through SECURITY DEFINER RPCs.
-- Revoking direct INSERT/UPDATE/DELETE from authenticated prevents
-- bypassing the authorization logic in RPCs.
-- =============================================================================

-- financial_records: all mutations through RPCs only
DO $$ BEGIN
  REVOKE INSERT, UPDATE, DELETE ON public.financial_records FROM authenticated;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- payout_requests: INSERT through request_payout() only, UPDATE through admin RPCs
DO $$ BEGIN
  REVOKE INSERT, UPDATE, DELETE ON public.payout_requests FROM authenticated;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- wallet_ledger: all mutations through RPCs only
DO $$ BEGIN
  REVOKE INSERT, UPDATE, DELETE ON public.wallet_ledger FROM authenticated;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- audit_logs: INSERT through write_admin_audit() only
DO $$ BEGIN
  REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Revoke DELETE from audit_logs RLS (defense-in-depth)
DROP POLICY IF EXISTS "audit_logs_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_delete" ON public.audit_logs
  FOR DELETE USING (false);


-- =============================================================================
-- PART 17: adjust_campaign_budget — lost during deduplication, restored here
--
-- Was incorrectly removed from both admin-schema.sql and finance-consolidation.sql
-- (each comment pointed to the other as authoritative, but neither had the function).
-- This is the ONLY executable definition. Runs last so cannot be overwritten.
-- =============================================================================

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

  SELECT * INTO v_campaign FROM public.campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;

  -- Authorization: campaign owner or admin
  IF v_campaign.created_by IS NOT NULL AND v_campaign.created_by = v_actor THEN
    -- Active creator enforcement: suspended/deactivated creators cannot adjust budgets
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = v_actor AND role = 'creator' AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Only active creators can adjust campaign budgets';
    END IF;
  ELSIF public.is_admin() THEN
    NULL; -- Admin adjusting campaign
  ELSE
    RAISE EXCEPTION 'Only the campaign owner or an admin can adjust the budget';
  END IF;

  -- Validate budget
  IF p_new_budget < 0 THEN
    RAISE EXCEPTION 'Budget cannot be negative';
  END IF;

  -- Calculate current committed spend from financial_records (net_amount)
  -- reserved = sum of net_amount where status in ('pending','processing')
  -- (paid records are already consumed by payouts)
  SELECT coalesce(sum(net_amount), 0) INTO v_current_spend
  FROM public.financial_records
  WHERE campaign_id = p_campaign_id AND status IN ('pending', 'processing');

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
    coalesce((SELECT email FROM public.profiles WHERE id = v_actor), 'unknown'),
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


-- =============================================================================
-- DONE
-- =============================================================================
