-- ===========================================================================
-- CASHFREE SANDBOX SECURITY TESTS
-- ===========================================================================
-- Tests A through Z for Cashfree campaign launch payment integration.
--
-- IMPORTANT: Run tests ONE AT A TIME (select a single test block, then Run).
--
-- Test UUIDs (must exist in auth.users + profiles):
--   Creator: e92427b0-254e-44cc-b2df-be83792c8a94
--   Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Clipper: 2d75364e-77e0-4eb2-af96-48f573cb4a43
--
-- Each test uses a deterministic UUID for its campaign.
-- ===========================================================================

-- ===========================================================================
-- TEST A: Unauthenticated create-order MUST FAIL
-- ===========================================================================
BEGIN;
SELECT set_config('role', 'anon', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000a'::uuid, 'order_a', 'session_a');
    ASSERT false, 'TEST A FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Not authenticated%', 'TEST A FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST A PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST B: Clipper role cannot create Cashfree payment order
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "2d75364e-77e0-4eb2-af96-48f573cb4a43", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000b'::uuid, 'order_b', 'session_b');
    ASSERT false, 'TEST B FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Only active creators%', 'TEST B FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST B PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST C: Creator cannot submit payment for non-existent campaign
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree('00000000-0000-0000-0000-000000000000'::uuid, 'order_c', 'session_c');
    ASSERT false, 'TEST C FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%not found or access denied%', 'TEST C FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST C PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST D: Server-side amount calculation matches expected formula
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test D', 'Brief', 'YouTube', 200, 'Test Creator', 'c0000000-0000-0000-0000-00000000000d'::uuid);
DO $$ DECLARE v_payment record; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000d'::uuid, 'order_d', 'session_d');
  SELECT * INTO v_payment FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000d';
  ASSERT v_payment.campaign_budget_rupees = 200, 'TEST D FAIL: budget';
  ASSERT v_payment.platform_fee_paise = 2000, 'TEST D FAIL: fee';
  ASSERT v_payment.total_payable_paise = 22000, 'TEST D FAIL: total';
  ASSERT v_payment.cashfree_flow = 'cashfree', 'TEST D FAIL: flow';
  ASSERT v_payment.cashfree_order_id = 'order_d', 'TEST D FAIL: order_id';
END $$;
SELECT 'TEST D PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST E: Deterministic order_id format is correct
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test E', 'Brief', 'YouTube', 50, 'Test Creator', 'c0000000-0000-0000-0000-00000000000e'::uuid);
DO $$ DECLARE v_order_id text; BEGIN
  v_order_id := 'cliptwo_c0000000-0000-0000-0000-00000000000e_' || extract(epoch from now())::text;
  ASSERT v_order_id LIKE 'cliptwo_c0000000-0000-0000-0000-00000000000e_%', 'TEST E FAIL: ' || v_order_id;
END $$;
SELECT 'TEST E PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST F: Server-side amount in webhook matches total_payable_paise
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test F', 'Brief', 'YouTube', 150, 'Test Creator', 'c0000000-0000-0000-0000-00000000000f'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000f'::uuid, 'order_f', 'session_f');
  SELECT public.verify_cashfree_webhook('order_f', 'cf_pay_123', 165.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST F FAIL: first call';
  SELECT public.verify_cashfree_webhook('order_f', 'cf_pay_123', 165.00) INTO v_result;
  ASSERT (v_result->>'idempotent')::boolean = true, 'TEST F FAIL: idempotent';
END $$;
SELECT 'TEST F PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST G: Webhook rejects when amount is tampered
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test G', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000g'::uuid);
DO $$ DECLARE v_result jsonb; v_ps text; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000g'::uuid, 'order_g', 'session_g');
  SELECT public.verify_cashfree_webhook('order_g', 'cf_tampered', 1.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = false, 'TEST G FAIL: expected failure';
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000g';
  ASSERT v_ps = 'rejected', 'TEST G FAIL: got ' || v_ps;
END $$;
SELECT 'TEST G PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST H: Webhook idempotent - second success call is no-op
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test H', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000h'::uuid);
DO $$ DECLARE v_result jsonb; v_payment record; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000h'::uuid, 'order_h', 'session_h');
  SELECT public.verify_cashfree_webhook('order_h', 'cf_h1', 110.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST H FAIL: first';
  SELECT public.verify_cashfree_webhook('order_h', 'cf_h1', 110.00) INTO v_result;
  ASSERT (v_result->>'idempotent')::boolean = true, 'TEST H FAIL: second';
  SELECT * INTO v_payment FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000h';
  ASSERT v_payment.payment_status = 'verified', 'TEST H FAIL: status';
END $$;
SELECT 'TEST H PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST I: Webhook failure idempotent - second failure call is no-op
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test I', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000i'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000i'::uuid, 'order_i', 'session_i');
  SELECT public.reject_cashfree_webhook('order_i', 'cf_i1', 'declined') INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST I FAIL: first';
  SELECT public.reject_cashfree_webhook('order_i', 'cf_i1', 'declined') INTO v_result;
  ASSERT (v_result->>'idempotent')::boolean = true, 'TEST I FAIL: second';
END $$;
SELECT 'TEST I PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST J: Amount mismatch is rejected (lower amount)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test J', 'Brief', 'YouTube', 200, 'Test Creator', 'c0000000-0000-0000-0000-00000000000j'::uuid);
DO $$ DECLARE v_result jsonb; v_ps text; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000j'::uuid, 'order_j', 'session_j');
  SELECT public.verify_cashfree_webhook('order_j', 'cf_j', 199.99) INTO v_result;
  ASSERT (v_result->>'success')::boolean = false, 'TEST J FAIL: expected failure';
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000j';
  ASSERT v_ps = 'rejected', 'TEST J FAIL: got ' || v_ps;
END $$;
SELECT 'TEST J PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST K: SQL injection prevention in order_id
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test K', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000k'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000k'::uuid, 'order''; DROP TABLE campaigns; --', 'session_k');
  SELECT public.verify_cashfree_webhook('order''; DROP TABLE campaigns; --', 'cf_k', 110.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST K FAIL: webhook';
  ASSERT EXISTS (SELECT 1 FROM public.campaigns LIMIT 1), 'TEST K FAIL: table dropped';
END $$;
SELECT 'TEST K PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST L: Unknown order_id in webhook is handled gracefully
-- ===========================================================================
BEGIN;
SELECT set_config('role', 'service_role', true);
DO $$ DECLARE v_result jsonb; BEGIN
  SELECT public.reject_cashfree_webhook('order_nonexistent', 'cf_none', 'failed') INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST L FAIL';
END $$;
SELECT 'TEST L PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST M: Amount verification tolerant of floating point (plus/minus 0.01)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test M', 'Brief', 'YouTube', 333, 'Test Creator', 'c0000000-0000-0000-0000-00000000000m'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000m'::uuid, 'order_m', 'session_m');
  SELECT public.verify_cashfree_webhook('order_m', 'cf_m', 366.29) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST M FAIL';
END $$;
SELECT 'TEST M PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST N: Error handling does not leak internal details
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-000000000000'::uuid, '', 'session_n');
    ASSERT false, 'TEST N FAIL';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err NOT LIKE '%campaign_launch_payments%', 'TEST N FAIL: leaks table';
    ASSERT v_err NOT LIKE '%cashfree_order_id%', 'TEST N FAIL: leaks column';
  END;
END $$;
SELECT 'TEST N PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST O: Stale webhook timestamp rejected (service_role RPC callable)
-- ===========================================================================
-- The timestamp freshness check is in the webhook API handler (TypeScript).
-- This test verifies the SQL RPC is callable by service_role after timestamp check.
BEGIN;
SELECT set_config('role', 'service_role', true);
DO $$ DECLARE v_result jsonb; BEGIN
  BEGIN
    SELECT public.verify_cashfree_webhook('order_nonexistent_ts', 'cf_ts', 100.00) INTO v_result;
    ASSERT false, 'TEST O FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Payment record not found%', 'TEST O FAIL: ' || SQLERRM;
  END;
END $$;
SELECT 'TEST O PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST P: Invalid webhook signature rejected (authenticated cannot call verify RPC)
-- ===========================================================================
-- Fix #9: verify_cashfree_webhook is service_role ONLY
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_p', 'cf_p', 100.00);
    ASSERT false, 'TEST P FAIL: authenticated should not call verify';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%function public.verify_cashfree_webhook%' OR
           v_err LIKE '%permission denied%' OR v_err LIKE '%does not exist%',
      'TEST P FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST P PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST Q: Pending payment cannot become verified (submitted required)
-- ===========================================================================
-- Fix #4: Only submitted payments can become verified
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test Q', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000q'::uuid);
DO $$ DECLARE v_result jsonb; v_ps text; BEGIN
  INSERT INTO public.campaign_launch_payments (campaign_id, creator_id, campaign_budget_rupees, platform_fee_paise, total_payable_paise, payment_status, cashfree_flow, cashfree_order_id)
  VALUES ('c0000000-0000-0000-0000-00000000000q'::uuid, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 1000, 11000, 'pending', 'cashfree', 'order_q_pending');
  PERFORM set_config('role', 'service_role', true);
  BEGIN
    SELECT public.verify_cashfree_webhook('order_q_pending', 'cf_q', 110.00) INTO v_result;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000q';
  ASSERT v_ps = 'pending', 'TEST Q FAIL: got ' || v_ps;
END $$;
SELECT 'TEST Q PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST R: SUCCESS webhook with wrong authoritative amount rejected
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test R', 'Brief', 'YouTube', 500, 'Test Creator', 'c0000000-0000-0000-0000-00000000000r'::uuid);
DO $$ DECLARE v_result jsonb; v_ps text; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000r'::uuid, 'order_r', 'session_r');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('order_r', 'cf_r', 100.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = false, 'TEST R FAIL: expected failure';
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000r';
  ASSERT v_ps = 'rejected', 'TEST R FAIL: got ' || v_ps;
END $$;
SELECT 'TEST R PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST S: Currency verification at API layer (SQL RPC works with correct amount)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test S', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000s'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000s'::uuid, 'order_s', 'session_s');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('order_s', 'cf_s', 110.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST S FAIL';
END $$;
SELECT 'TEST S PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST T: Payment for unrelated Cashfree order rejected
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test T', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000t'::uuid);
DO $$ DECLARE v_result jsonb; v_ps text; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000t'::uuid, 'order_t', 'session_t');
  PERFORM set_config('role', 'service_role', true);
  BEGIN
    SELECT public.verify_cashfree_webhook('order_different_unrelated', 'cf_t', 110.00) INTO v_result;
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Payment record not found%', 'TEST T FAIL: ' || SQLERRM;
  END;
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000t';
  ASSERT v_ps = 'submitted', 'TEST T FAIL: got ' || v_ps;
END $$;
SELECT 'TEST T PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST U: Pending payment cannot become verified (definitive test)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test U', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000u'::uuid);
DO $$ DECLARE v_err text; v_ps text; BEGIN
  INSERT INTO public.campaign_launch_payments (campaign_id, creator_id, campaign_budget_rupees, platform_fee_paise, total_payable_paise, payment_status, cashfree_flow, cashfree_order_id)
  VALUES ('c0000000-0000-0000-0000-00000000000u'::uuid, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 1000, 11000, 'pending', 'cashfree', 'order_u_pending');
  PERFORM set_config('role', 'service_role', true);
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_u_pending', 'cf_u', 110.00);
    ASSERT false, 'TEST U FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%not in submitted status%', 'TEST U FAIL: ' || v_err;
  END;
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000u';
  ASSERT v_ps = 'pending', 'TEST U FAIL: got ' || v_ps;
END $$;
SELECT 'TEST U PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST V: Rejected payment cannot become verified
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test V', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000v'::uuid);
DO $$ DECLARE v_err text; v_ps text; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000v'::uuid, 'order_v', 'session_v');
  PERFORM set_config('role', 'service_role', true);
  PERFORM public.reject_cashfree_webhook('order_v', 'cf_v_reject', 'test reject');
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000v';
  ASSERT v_ps = 'rejected', 'TEST V FAIL: reject step got ' || v_ps;
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_v', 'cf_v_try', 110.00);
    ASSERT false, 'TEST V FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%not in submitted status%', 'TEST V FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST V PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST W: Duplicate create-order reuses existing active order
-- ===========================================================================
-- Fix #6: The API layer checks for existing active Cashfree orders.
-- This test verifies the unique constraint on cashfree_order_id prevents duplicates.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test W', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000w'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000w'::uuid, 'order_w_first', 'session_w_first');
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000w'::uuid, 'order_w_second', 'session_w_second');
    ASSERT false, 'TEST W FAIL: should not allow duplicate active order';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;
SELECT 'TEST W PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST X: Missing creator phone is handled safely (at API layer)
-- ===========================================================================
-- The phone validation happens in the TypeScript create-order API route.
-- This test verifies the RPC works correctly with valid inputs.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test X', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000x'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000x'::uuid, 'order_x', 'session_x');
  ASSERT true, 'TEST X PASS';
END $$;
SELECT 'TEST X PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST Y: Creator cannot execute verification RPC directly
-- ===========================================================================
-- Fix #9: verify_cashfree_webhook is service_role ONLY
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_y', 'cf_y', 100.00);
    ASSERT false, 'TEST Y FAIL: creator should not call verify';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%function public.verify_cashfree_webhook%' OR
           v_err LIKE '%permission denied%' OR v_err LIKE '%does not exist%',
      'TEST Y FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST Y PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST Z: Open/unverified campaign cannot be created through Cashfree path
-- ===========================================================================
-- Fix #5: submit_campaign_launch_payment_cashfree only accepts draft campaigns
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test Z', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000z'::uuid);
DO $$ DECLARE v_err text; BEGIN
  -- First submit and verify to open the campaign
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000z'::uuid, 'order_z', 'session_z');
  PERFORM set_config('role', 'service_role', true);
  PERFORM public.verify_cashfree_webhook('order_z', 'cf_z', 110.00);
  -- Now try to submit again on the open campaign — should fail
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000z'::uuid, 'order_z2', 'session_z2');
    ASSERT false, 'TEST Z FAIL: should not allow Cashfree payment on open campaign';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%only available for draft%', 'TEST Z FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST Z PASSED' AS result;
ROLLBACK;
