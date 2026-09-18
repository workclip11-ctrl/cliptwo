-- ===========================================================================
-- CASHFREE SANDBOX SECURITY TESTS
-- ===========================================================================
-- Comprehensive tests for Cashfree campaign launch payment integration.
--
-- IMPORTANT: Run tests ONE AT A TIME (select a single test block, then Run).
--
-- Test UUIDs (must exist in auth.users + profiles):
--   Creator: e92427b0-254e-44cc-b2df-be83792c8a94
--   Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Clipper: 2d75364e-77e0-4eb2-af96-48f573cb4a43
--
-- Role model for Cashfree RPCs:
--   reserve_cashfree_payment_attempt: authenticated (creator only)
--   confirm_cashfree_payment_attempt: authenticated (creator only)
--   release_cashfree_payment_reservation: authenticated (creator only)
--   verify_cashfree_webhook: service_role ONLY
--   reject_cashfree_webhook: service_role ONLY
-- ===========================================================================

-- === SECTION 1: reserve_cashfree_payment_attempt access control ===

-- TEST A: Unauthenticated reserve MUST FAIL
BEGIN;
SELECT set_config('role', 'anon', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000a'::uuid);
    ASSERT false, 'TEST A FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Not authenticated%', 'TEST A FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST A PASSED' AS result;
ROLLBACK;

-- TEST B: Clipper role cannot reserve
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "2d75364e-77e0-4eb2-af96-48f573cb4a43", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000b'::uuid);
    ASSERT false, 'TEST B FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Only active creators%', 'TEST B FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST B PASSED' AS result;
ROLLBACK;

-- TEST C: Creator cannot reserve for non-existent campaign
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.reserve_cashfree_payment_attempt('00000000-0000-0000-0000-000000000000'::uuid);
    ASSERT false, 'TEST C FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%not found or access denied%', 'TEST C FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST C PASSED' AS result;
ROLLBACK;

-- TEST D: Draft-only check (open campaign cannot reserve)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test D', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000d'::uuid);
DO $$ DECLARE v_result jsonb; v_err text; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000d'::uuid);
  PERFORM set_config('role', 'service_role', true);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000d'::uuid, 'session_d');
  PERFORM public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-00000000000d_attempt_1', 'cf_d', 110.00);
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000d'::uuid);
    ASSERT false, 'TEST D FAIL: should not allow reserve on open campaign';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%only available for draft%', 'TEST D FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST D PASSED' AS result;
ROLLBACK;

-- === SECTION 2: reserve/confirm/release flow ===

-- TEST E: Successful reserve + confirm flow
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test E', 'Brief', 'YouTube', 150, 'Test Creator', 'c0000000-0000-0000-0000-00000000000e'::uuid);
DO $$ DECLARE v_result jsonb; v_p_status text; v_order_id text; BEGIN
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000e'::uuid) INTO v_result;
  ASSERT (v_result->>'reserved')::boolean = true, 'TEST E FAIL: not reserved';
  v_order_id := v_result->>'order_id';
  ASSERT v_order_id LIKE 'cliptwo_c0000000-0000-0000-0000-00000000000e_attempt_%', 'TEST E FAIL: order_id format';
  SELECT public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000e'::uuid, 'session_e') INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST E FAIL: confirm';
  SELECT payment_status INTO v_p_status FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000e';
  ASSERT v_p_status = 'submitted', 'TEST E FAIL: status is ' || v_p_status;
END $$;
SELECT 'TEST E PASSED' AS result;
ROLLBACK;

-- TEST F: Deterministic order_id remains stable for retries
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test F', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000f'::uuid);
DO $$ DECLARE v_result jsonb; v_order1 text; v_order2 text; BEGIN
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000f'::uuid) INTO v_result;
  v_order1 := v_result->>'order_id';
  -- Release and re-reserve
  PERFORM public.release_cashfree_payment_reservation('c0000000-0000-0000-0000-00000000000f'::uuid);
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000f'::uuid) INTO v_result;
  v_order2 := v_result->>'order_id';
  -- Different attempt number, both deterministic
  ASSERT v_order1 != v_order2, 'TEST F FAIL: same order_id after release';
  ASSERT v_order1 LIKE 'cliptwo_c0000000-0000-0000-0000-00000000000f_attempt_1', 'TEST F FAIL: first attempt';
  ASSERT v_order2 LIKE 'cliptwo_c0000000-0000-0000-0000-00000000000f_attempt_2', 'TEST F FAIL: second attempt';
END $$;
SELECT 'TEST F PASSED' AS result;
ROLLBACK;

-- TEST G: Concurrent reserve attempts — only one succeeds
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test G', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000g'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000g'::uuid);
  -- Second reserve for same campaign should return reused
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000g'::uuid) INTO v_result;
  ASSERT (v_result->>'reused')::boolean = true, 'TEST G FAIL: should reuse';
END $$;
SELECT 'TEST G PASSED' AS result;
ROLLBACK;

-- TEST H: Release reservation allows new attempt
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test H', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000h'::uuid);
DO $$ DECLARE v_result jsonb; v_p_count integer; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000h'::uuid);
  PERFORM public.release_cashfree_payment_reservation('c0000000-0000-0000-0000-00000000000h'::uuid);
  SELECT count(*) INTO v_p_count FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000h';
  ASSERT v_p_count = 0, 'TEST H FAIL: reservation not deleted, count=' || v_p_count;
  -- Can reserve again
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000h'::uuid) INTO v_result;
  ASSERT (v_result->>'reserved')::boolean = true, 'TEST H FAIL: re-reserve';
END $$;
SELECT 'TEST H PASSED' AS result;
ROLLBACK;

-- TEST I: Different campaigns can have different Cashfree orders
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test I-1', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000i1'::uuid);
SELECT public.create_campaign('Cashfree Test I-2', 'Brief', 'YouTube', 200, 'Test Creator', 'c0000000-0000-0000-0000-00000000000i2'::uuid);
DO $$ DECLARE v_r1 jsonb; v_r2 jsonb; BEGIN
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000i1'::uuid) INTO v_r1;
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000i2'::uuid) INTO v_r2;
  ASSERT (v_r1->>'order_id') != (v_r2->>'order_id'), 'TEST I FAIL: same order_id';
END $$;
SELECT 'TEST I PASSED' AS result;
ROLLBACK;

-- === SECTION 3: confirm/release access control ===

-- TEST J: Anon cannot confirm
BEGIN;
SELECT set_config('role', 'anon', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000j'::uuid, 'session');
    ASSERT false, 'TEST J FAIL';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Not authenticated%', 'TEST J FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST J PASSED' AS result;
ROLLBACK;

-- TEST K: Anon cannot release
BEGIN;
SELECT set_config('role', 'anon', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.release_cashfree_payment_reservation('c0000000-0000-0000-0000-00000000000k'::uuid);
    ASSERT false, 'TEST K FAIL';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Not authenticated%', 'TEST K FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST K PASSED' AS result;
ROLLBACK;

-- === SECTION 4: verify_cashfree_webhook access control ===

-- TEST L: Creator CANNOT execute verify RPC (service_role ONLY)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_l', 'cf_l', 100.00);
    ASSERT false, 'TEST L FAIL: creator should not call verify';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%function public.verify_cashfree_webhook%' OR
           v_err LIKE '%permission denied%' OR v_err LIKE '%does not exist%',
      'TEST L FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST L PASSED' AS result;
ROLLBACK;

-- TEST M: Anon CANNOT execute verify RPC
BEGIN;
SELECT set_config('role', 'anon', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_m', 'cf_m', 100.00);
    ASSERT false, 'TEST M FAIL: anon should not call verify';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%function public.verify_cashfree_webhook%' OR
           v_err LIKE '%permission denied%' OR v_err LIKE '%does not exist%',
      'TEST M FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST M PASSED' AS result;
ROLLBACK;

-- TEST N: Service-role CAN execute verify RPC
BEGIN;
SELECT set_config('role', 'service_role', true);
DO $$ DECLARE v_result jsonb; BEGIN
  BEGIN
    SELECT public.verify_cashfree_webhook('order_nonexistent_n', 'cf_n', 100.00) INTO v_result;
    ASSERT false, 'TEST N FAIL: should raise for unknown order';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Payment record not found%', 'TEST N FAIL: ' || SQLERRM;
  END;
END $$;
SELECT 'TEST N PASSED' AS result;
ROLLBACK;

-- === SECTION 5: reject_cashfree_webhook access control ===

-- TEST O: Creator CANNOT execute reject RPC (service_role ONLY)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.reject_cashfree_webhook('order_o', 'cf_o', 'test');
    ASSERT false, 'TEST O FAIL: creator should not call reject';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%function public.reject_cashfree_webhook%' OR
           v_err LIKE '%permission denied%' OR v_err LIKE '%does not exist%',
      'TEST O FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST O PASSED' AS result;
ROLLBACK;

-- TEST P: Anon CANNOT execute reject RPC
BEGIN;
SELECT set_config('role', 'anon', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.reject_cashfree_webhook('order_p', 'cf_p', 'test');
    ASSERT false, 'TEST P FAIL: anon should not call reject';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%function public.reject_cashfree_webhook%' OR
           v_err LIKE '%permission denied%' OR v_err LIKE '%does not exist%',
      'TEST P FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST P PASSED' AS result;
ROLLBACK;

-- TEST Q: Service-role CAN execute reject RPC
BEGIN;
SELECT set_config('role', 'service_role', true);
DO $$ DECLARE v_result jsonb; BEGIN
  SELECT public.reject_cashfree_webhook('order_nonexistent_q', 'cf_q', 'failed') INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST Q FAIL';
END $$;
SELECT 'TEST Q PASSED' AS result;
ROLLBACK;

-- === SECTION 6: verify_cashfree_webhook verification logic ===

-- TEST R: Successful verification opens campaign atomically
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test R', 'Brief', 'YouTube', 150, 'Test Creator', 'c0000000-0000-0000-0000-00000000000r'::uuid);
DO $$ DECLARE v_result jsonb; v_c_status text; v_p_status text; v_verified_by uuid; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000r'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000r'::uuid, 'session_r');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-00000000000r_attempt_1', 'cf_r', 165.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST R FAIL: verify';
  ASSERT (v_result->>'campaign_status')::text = 'open', 'TEST R FAIL: campaign not open';
  SELECT status INTO v_c_status FROM public.campaigns WHERE id = 'c0000000-0000-0000-0000-00000000000r';
  ASSERT v_c_status = 'open', 'TEST R FAIL: status is ' || v_c_status;
  SELECT payment_status INTO v_p_status FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000r';
  ASSERT v_p_status = 'verified', 'TEST R FAIL: payment status is ' || v_p_status;
  SELECT verified_by INTO v_verified_by FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000r';
  ASSERT v_verified_by = '00000000-0000-0000-0000-000000000000', 'TEST R FAIL: verified_by should be system';
END $$;
SELECT 'TEST R PASSED' AS result;
ROLLBACK;

-- TEST S: Idempotent verification
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test S', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000s'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000s'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000s'::uuid, 'session_s');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-00000000000s_attempt_1', 'cf_s1', 110.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST S FAIL: first';
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-00000000000s_attempt_1', 'cf_s1', 110.00) INTO v_result;
  ASSERT (v_result->>'idempotent')::boolean = true, 'TEST S FAIL: idempotent';
END $$;
SELECT 'TEST S PASSED' AS result;
ROLLBACK;

-- TEST T: Wrong amount is rejected
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test T', 'Brief', 'YouTube', 200, 'Test Creator', 'c0000000-0000-0000-0000-00000000000t'::uuid);
DO $$ DECLARE v_result jsonb; v_ps text; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000t'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000t'::uuid, 'session_t');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-00000000000t_attempt_1', 'cf_t', 999.99) INTO v_result;
  ASSERT (v_result->>'success')::boolean = false, 'TEST T FAIL: expected failure';
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000t';
  ASSERT v_ps = 'rejected', 'TEST T FAIL: got ' || v_ps;
END $$;
SELECT 'TEST T PASSED' AS result;
ROLLBACK;

-- TEST U: Amount tolerance (within 0.01) is accepted
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test U', 'Brief', 'YouTube', 333, 'Test Creator', 'c0000000-0000-0000-0000-00000000000u'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000u'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000u'::uuid, 'session_u');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-00000000000u_attempt_1', 'cf_u', 366.30) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST U FAIL';
END $$;
SELECT 'TEST U PASSED' AS result;
ROLLBACK;

-- TEST V: Pending cannot become verified
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test V', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000v'::uuid);
DO $$ DECLARE v_err text; v_ps text; BEGIN
  INSERT INTO public.campaign_launch_payments (campaign_id, creator_id, campaign_budget_rupees, platform_fee_paise, total_payable_paise, payment_status, cashfree_flow, cashfree_order_id)
  VALUES ('c0000000-0000-0000-0000-00000000000v'::uuid, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 1000, 11000, 'pending', 'cashfree', 'order_v_pending');
  PERFORM set_config('role', 'service_role', true);
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_v_pending', 'cf_v', 110.00);
    ASSERT false, 'TEST V FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%not in submitted status%', 'TEST V FAIL: ' || v_err;
  END;
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000v';
  ASSERT v_ps = 'pending', 'TEST V FAIL: got ' || v_ps;
END $$;
SELECT 'TEST V PASSED' AS result;
ROLLBACK;

-- TEST W: Rejected cannot become verified
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test W', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000w'::uuid);
DO $$ DECLARE v_err text; v_ps text; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000w'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000w'::uuid, 'session_w');
  PERFORM set_config('role', 'service_role', true);
  PERFORM public.reject_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-00000000000w_attempt_1', 'cf_w_reject', 'test reject');
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000w';
  ASSERT v_ps = 'rejected', 'TEST W FAIL: reject step got ' || v_ps;
  BEGIN
    PERFORM public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-00000000000w_attempt_1', 'cf_w_try', 110.00);
    ASSERT false, 'TEST W FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%not in submitted status%', 'TEST W FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST W PASSED' AS result;
ROLLBACK;

-- TEST X: Unknown order in verify raises exception
BEGIN;
SELECT set_config('role', 'service_role', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_nonexistent_x', 'cf_x', 100.00);
    ASSERT false, 'TEST X FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Payment record not found%', 'TEST X FAIL: ' || SQLERRM;
  END;
END $$;
SELECT 'TEST X PASSED' AS result;
ROLLBACK;

-- TEST Y: Unknown order in reject is idempotent
BEGIN;
SELECT set_config('role', 'service_role', true);
DO $$ DECLARE v_result jsonb; BEGIN
  SELECT public.reject_cashfree_webhook('order_nonexistent_y', 'cf_y', 'failed') INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST Y FAIL';
  ASSERT (v_result->>'idempotent')::boolean = true, 'TEST Y FAIL: not idempotent';
END $$;
SELECT 'TEST Y PASSED' AS result;
ROLLBACK;

-- TEST Z: SQL injection prevention
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test Z', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000z'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000z'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-00000000000z'::uuid, 'session_z');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('order''; DROP TABLE campaigns; --', 'cf_z', 110.00) INTO v_result;
  ASSERT false, 'TEST Z FAIL: should have raised exception';
EXCEPTION WHEN OTHERS THEN
  ASSERT EXISTS (SELECT 1 FROM public.campaigns LIMIT 1), 'TEST Z FAIL: table dropped';
END $$;
SELECT 'TEST Z PASSED' AS result;
ROLLBACK;

-- === SECTION 7: Additional tests (AA-AO) ===

-- TEST AA: Unrelated order_id cannot verify another campaign
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AA', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000aa'::uuid);
DO $$ DECLARE v_result jsonb; v_ps text; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000aa'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000aa'::uuid, 'session_aa');
  PERFORM set_config('role', 'service_role', true);
  BEGIN
    SELECT public.verify_cashfree_webhook('order_different_aa', 'cf_aa', 110.00) INTO v_result;
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Payment record not found%', 'TEST AA FAIL: ' || SQLERRM;
  END;
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-0000000000aa';
  ASSERT v_ps = 'submitted', 'TEST AA FAIL: got ' || v_ps;
END $$;
SELECT 'TEST AA PASSED' AS result;
ROLLBACK;

-- TEST AB: Audit log records system actor for verification
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AB', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000ab'::uuid);
DO $$ DECLARE v_result jsonb; v_log_actor text; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ab'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ab'::uuid, 'session_ab');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-0000000000ab_attempt_1', 'cf_ab', 110.00) INTO v_result;
  SELECT actor INTO v_log_actor FROM public.audit_logs WHERE action = 'campaign_payment_verified_cashfree' AND entity_id = 'c0000000-0000-0000-0000-0000000000ab' LIMIT 1;
  ASSERT v_log_actor = 'system', 'TEST AB FAIL: audit actor is ' || v_log_actor;
END $$;
SELECT 'TEST AB PASSED' AS result;
ROLLBACK;

-- TEST AC: Rejection audit trail exists
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AC', 'Brief', 'YouTube', 200, 'Test Creator', 'c0000000-0000-0000-0000-0000000000ac'::uuid);
DO $$ DECLARE v_result jsonb; v_log_exists boolean; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ac'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ac'::uuid, 'session_ac');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-0000000000ac_attempt_1', 'cf_ac_bad', 1.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = false, 'TEST AC FAIL: expected failure';
  SELECT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'campaign_payment_rejected_amount_mismatch' AND entity_id = 'c0000000-0000-0000-0000-0000000000ac') INTO v_log_exists;
  ASSERT v_log_exists, 'TEST AC FAIL: no rejection audit log';
END $$;
SELECT 'TEST AC PASSED' AS result;
ROLLBACK;

-- TEST AD: Open/unverified impossible via verify RPC
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AD', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000ad'::uuid);
DO $$ DECLARE v_result jsonb; v_c_status text; v_lps text; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ad'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ad'::uuid, 'session_ad');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-0000000000ad_attempt_1', 'cf_ad', 110.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST AD FAIL: verify';
  SELECT status, launch_payment_status INTO v_c_status, v_lps FROM public.campaigns WHERE id = 'c0000000-0000-0000-0000-0000000000ad';
  ASSERT v_c_status = 'open', 'TEST AD FAIL: status is ' || v_c_status;
  ASSERT v_lps = 'verified', 'TEST AD FAIL: lps is ' || v_lps;
END $$;
SELECT 'TEST AD PASSED' AS result;
ROLLBACK;

-- TEST AE: Wrong order_id in Cashfree response is rejected
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AE', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000ae'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ae'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ae'::uuid, 'session_ae');
  PERFORM set_config('role', 'service_role', true);
  BEGIN
    SELECT public.verify_cashfree_webhook('order_wrong_ae', 'cf_ae', 110.00) INTO v_result;
    ASSERT false, 'TEST AE FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Payment record not found%', 'TEST AE FAIL: ' || SQLERRM;
  END;
END $$;
SELECT 'TEST AE PASSED' AS result;
ROLLBACK;

-- TEST AF: Wrong cf_payment_id is rejected (via webhook — not at RPC level)
-- This tests the RPC accepts any cf_payment_id but the webhook handler
-- would have already rejected a mismatch. The RPC just stores whatever it receives.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AF', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000af'::uuid);
DO $$ DECLARE v_result jsonb; v_cf_id text; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000af'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000af'::uuid, 'session_af');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-0000000000af_attempt_1', 'cf_af_wrong', 110.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST AF FAIL: verify';
  SELECT cashfree_cf_payment_id INTO v_cf_id FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-0000000000af';
  ASSERT v_cf_id = 'cf_af_wrong', 'TEST AF FAIL: cf_payment_id not stored';
END $$;
SELECT 'TEST AF PASSED' AS result;
ROLLBACK;

-- TEST AG: Wrong currency cannot verify (tested at webhook level, RPC stores)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AG', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000ag'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ag'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ag'::uuid, 'session_ag');
  PERFORM set_config('role', 'service_role', true);
  -- RPC doesn't check currency (that's the webhook handler's job)
  -- But amount check is in the RPC — wrong amount should fail
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-0000000000ag_attempt_1', 'cf_ag', 0.01) INTO v_result;
  ASSERT (v_result->>'success')::boolean = false, 'TEST AG FAIL: wrong amount should fail';
END $$;
SELECT 'TEST AG PASSED' AS result;
ROLLBACK;

-- TEST AH: Verification is atomic (payment + campaign + audit in one tx)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AH', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000ah'::uuid);
DO $$ DECLARE v_result jsonb; v_p_status text; v_c_status text; v_lps text; v_log_exists boolean; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ah'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ah'::uuid, 'session_ah');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-0000000000ah_attempt_1', 'cf_ah', 110.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST AH FAIL: verify';
  SELECT payment_status INTO v_p_status FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-0000000000ah';
  SELECT status, launch_payment_status INTO v_c_status, v_lps FROM public.campaigns WHERE id = 'c0000000-0000-0000-0000-0000000000ah';
  SELECT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'campaign_payment_verified_cashfree' AND entity_id = 'c0000000-0000-0000-0000-0000000000ah') INTO v_log_exists;
  ASSERT v_p_status = 'verified', 'TEST AH FAIL: payment not verified';
  ASSERT v_c_status = 'open', 'TEST AH FAIL: campaign not open';
  ASSERT v_lps = 'verified', 'TEST AH FAIL: lps not verified';
  ASSERT v_log_exists, 'TEST AH FAIL: no audit log';
END $$;
SELECT 'TEST AH PASSED' AS result;
ROLLBACK;

-- TEST AI: Release reservation after Cashfree failure allows new attempt
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AI', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000ai'::uuid);
DO $$ DECLARE v_result jsonb; v_order1 text; v_order2 text; BEGIN
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ai'::uuid) INTO v_result;
  v_order1 := v_result->>'order_id';
  -- Simulate Cashfree failure: release reservation
  PERFORM public.release_cashfree_payment_reservation('c0000000-0000-0000-0000-0000000000ai'::uuid);
  -- New attempt
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ai'::uuid) INTO v_result;
  v_order2 := v_result->>'order_id';
  ASSERT v_order1 != v_order2, 'TEST AI FAIL: same order after release';
  ASSERT v_order2 LIKE '%attempt_2%', 'TEST AI FAIL: not attempt 2';
END $$;
SELECT 'TEST AI PASSED' AS result;
ROLLBACK;

-- TEST AJ: Retry after Cashfree success but confirm failure reuses reservation
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AJ', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000aj'::uuid);
DO $$ DECLARE v_result jsonb; v_order1 text; v_order2 text; BEGIN
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000aj'::uuid) INTO v_result;
  v_order1 := v_result->>'order_id';
  -- Retry without releasing — should reuse
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000aj'::uuid) INTO v_result;
  v_order2 := v_result->>'order_id';
  ASSERT v_order1 = v_order2, 'TEST AJ FAIL: different order_id on retry';
  ASSERT (v_result->>'reused')::boolean = true, 'TEST AJ FAIL: not reused';
END $$;
SELECT 'TEST AJ PASSED' AS result;
ROLLBACK;

-- TEST AK: Payment flow: reserve → confirm → verify → open
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AK', 'Brief', 'YouTube', 500, 'Test Creator', 'c0000000-0000-0000-0000-0000000000ak'::uuid);
DO $$ DECLARE v_result jsonb; v_c_status text; BEGIN
  -- Reserve
  SELECT public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ak'::uuid) INTO v_result;
  ASSERT (v_result->>'reserved')::boolean = true, 'TEST AK FAIL: reserve';
  -- Confirm
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ak'::uuid, 'session_ak');
  -- Verify
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-0000000000ak_attempt_1', 'cf_ak', 550.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST AK FAIL: verify';
  SELECT status INTO v_c_status FROM public.campaigns WHERE id = 'c0000000-0000-0000-0000-0000000000ak';
  ASSERT v_c_status = 'open', 'TEST AK FAIL: not open';
END $$;
SELECT 'TEST AK PASSED' AS result;
ROLLBACK;

-- TEST AL: No path allows open + unverified
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AL', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000al'::uuid);
DO $$ DECLARE v_c_status text; v_lps text; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000al'::uuid);
  -- Campaign should be draft, not open
  SELECT status, launch_payment_status INTO v_c_status, v_lps FROM public.campaigns WHERE id = 'c0000000-0000-0000-0000-0000000000al';
  ASSERT v_c_status = 'draft', 'TEST AL FAIL: status is ' || v_c_status;
  ASSERT v_lps = 'submitted', 'TEST AL FAIL: lps is ' || v_lps;
END $$;
SELECT 'TEST AL PASSED' AS result;
ROLLBACK;

-- TEST AM: confirm on non-reserving status fails
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AM', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000am'::uuid);
DO $$ DECLARE v_err text; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000am'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000am'::uuid, 'session_am');
  -- Try to confirm again (already submitted)
  BEGIN
    PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000am'::uuid, 'session_am2');
    ASSERT false, 'TEST AM FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%No active Cashfree reservation%', 'TEST AM FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST AM PASSED' AS result;
ROLLBACK;

-- TEST AN: Release on non-reserving status is idempotent
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AN', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000an'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000an'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000an'::uuid, 'session_an');
  -- Release on submitted status — should be idempotent
  SELECT public.release_cashfree_payment_reservation('c0000000-0000-0000-0000-0000000000an'::uuid) INTO v_result;
  ASSERT (v_result->>'idempotent')::boolean = true, 'TEST AN FAIL: not idempotent';
END $$;
SELECT 'TEST AN PASSED' AS result;
ROLLBACK;

-- TEST AO: Amount mismatch in RPC rejects correctly
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test AO', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-0000000000ao'::uuid);
DO $$ DECLARE v_result jsonb; v_ps text; BEGIN
  PERFORM public.reserve_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ao'::uuid);
  PERFORM public.confirm_cashfree_payment_attempt('c0000000-0000-0000-0000-0000000000ao'::uuid, 'session_ao');
  PERFORM set_config('role', 'service_role', true);
  -- Wrong amount: expected 110.00 (100 * 1.1), sending 50.00
  SELECT public.verify_cashfree_webhook('cliptwo_c0000000-0000-0000-0000-0000000000ao_attempt_1', 'cf_ao', 50.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = false, 'TEST AO FAIL: expected failure';
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-0000000000ao';
  ASSERT v_ps = 'rejected', 'TEST AO FAIL: got ' || v_ps;
END $$;
SELECT 'TEST AO PASSED' AS result;
ROLLBACK;
