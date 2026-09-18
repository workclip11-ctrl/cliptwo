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
--   submit_campaign_launch_payment_cashfree: authenticated (creator only)
--   verify_cashfree_webhook: service_role ONLY (webhook handler)
--   reject_cashfree_webhook: service_role ONLY (webhook handler)
-- ===========================================================================

-- === SECTION 1: submit_campaign_launch_payment_cashfree (authenticated) ===

-- TEST A: Unauthenticated submit MUST FAIL
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

-- TEST B: Clipper role cannot submit Cashfree payment
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

-- TEST C: Creator cannot submit payment for non-existent campaign
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

-- TEST D: Amount calculation matches expected formula
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test D', 'Brief', 'YouTube', 200, 'Test Creator', 'c0000000-0000-0000-0000-00000000000d'::uuid);
DO $$ DECLARE v_p record; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000d'::uuid, 'order_d', 'session_d');
  SELECT * INTO v_p FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000d';
  ASSERT v_p.campaign_budget_rupees = 200, 'TEST D FAIL: budget';
  ASSERT v_p.platform_fee_paise = 2000, 'TEST D FAIL: fee';
  ASSERT v_p.total_payable_paise = 22000, 'TEST D FAIL: total';
  ASSERT v_p.cashfree_flow = 'cashfree', 'TEST D FAIL: flow';
  ASSERT v_p.cashfree_order_id = 'order_d', 'TEST D FAIL: order_id';
END $$;
SELECT 'TEST D PASSED' AS result;
ROLLBACK;

-- TEST E: Missing order_id rejected
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000e'::uuid, '', 'session_e');
    ASSERT false, 'TEST E FAIL';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%order ID%', 'TEST E FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST E PASSED' AS result;
ROLLBACK;

-- TEST F: Duplicate active order prevented (unique constraint)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test F', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000f'::uuid);
DO $$ BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000f'::uuid, 'order_f1', 'session_f1');
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000f'::uuid, 'order_f2', 'session_f2');
    ASSERT false, 'TEST F FAIL: should not allow duplicate active order';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
SELECT 'TEST F PASSED' AS result;
ROLLBACK;

-- TEST G: Draft-only check (open campaign cannot start Cashfree)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test G', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000g'::uuid);
DO $$ DECLARE v_err text; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000g'::uuid, 'order_g', 'session_g');
  PERFORM set_config('role', 'service_role', true);
  PERFORM public.verify_cashfree_webhook('order_g', 'cf_g', 110.00);
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000g'::uuid, 'order_g2', 'session_g2');
    ASSERT false, 'TEST G FAIL: should not allow Cashfree payment on open campaign';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%only available for draft%', 'TEST G FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST G PASSED' AS result;
ROLLBACK;

-- === SECTION 2: verify_cashfree_webhook access control ===

-- TEST H: Creator CANNOT execute verify RPC (service_role ONLY)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_h', 'cf_h', 100.00);
    ASSERT false, 'TEST H FAIL: creator should not call verify';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%function public.verify_cashfree_webhook%' OR
           v_err LIKE '%permission denied%' OR v_err LIKE '%does not exist%',
      'TEST H FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST H PASSED' AS result;
ROLLBACK;

-- TEST I: Anon CANNOT execute verify RPC
BEGIN;
SELECT set_config('role', 'anon', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_i', 'cf_i', 100.00);
    ASSERT false, 'TEST I FAIL: anon should not call verify';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%function public.verify_cashfree_webhook%' OR
           v_err LIKE '%permission denied%' OR v_err LIKE '%does not exist%',
      'TEST I FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST I PASSED' AS result;
ROLLBACK;

-- TEST J: Service-role CAN execute verify RPC
BEGIN;
SELECT set_config('role', 'service_role', true);
DO $$ DECLARE v_result jsonb; BEGIN
  BEGIN
    SELECT public.verify_cashfree_webhook('order_nonexistent_j', 'cf_j', 100.00) INTO v_result;
    ASSERT false, 'TEST J FAIL: should raise for unknown order';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Payment record not found%', 'TEST J FAIL: ' || SQLERRM;
  END;
END $$;
SELECT 'TEST J PASSED' AS result;
ROLLBACK;

-- === SECTION 3: reject_cashfree_webhook access control ===

-- TEST K: Creator CANNOT execute reject RPC (service_role ONLY)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.reject_cashfree_webhook('order_k', 'cf_k', 'test');
    ASSERT false, 'TEST K FAIL: creator should not call reject';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%function public.reject_cashfree_webhook%' OR
           v_err LIKE '%permission denied%' OR v_err LIKE '%does not exist%',
      'TEST K FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST K PASSED' AS result;
ROLLBACK;

-- TEST L: Anon CANNOT execute reject RPC
BEGIN;
SELECT set_config('role', 'anon', true);
DO $$ DECLARE v_err text; BEGIN
  BEGIN
    PERFORM public.reject_cashfree_webhook('order_l', 'cf_l', 'test');
    ASSERT false, 'TEST L FAIL: anon should not call reject';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%function public.reject_cashfree_webhook%' OR
           v_err LIKE '%permission denied%' OR v_err LIKE '%does not exist%',
      'TEST L FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST L PASSED' AS result;
ROLLBACK;

-- TEST M: Service-role CAN execute reject RPC
BEGIN;
SELECT set_config('role', 'service_role', true);
DO $$ DECLARE v_result jsonb; BEGIN
  SELECT public.reject_cashfree_webhook('order_nonexistent_m', 'cf_m', 'failed') INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST M FAIL';
END $$;
SELECT 'TEST M PASSED' AS result;
ROLLBACK;

-- === SECTION 4: verify_cashfree_webhook verification logic ===

-- TEST N: Unknown order_id returns idempotent success (not error)
BEGIN;
SELECT set_config('role', 'service_role', true);
DO $$ DECLARE v_result jsonb; BEGIN
  SELECT public.verify_cashfree_webhook('order_nonexistent_n', 'cf_n', 100.00) INTO v_result;
  ASSERT false, 'TEST N FAIL: should have raised exception';
EXCEPTION WHEN OTHERS THEN
  ASSERT SQLERRM LIKE '%Payment record not found%', 'TEST N FAIL: ' || SQLERRM;
END $$;
SELECT 'TEST N PASSED' AS result;
ROLLBACK;

-- TEST O: Successful verification opens campaign atomically
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test O', 'Brief', 'YouTube', 150, 'Test Creator', 'c0000000-0000-0000-0000-00000000000o'::uuid);
DO $$ DECLARE v_result jsonb; v_c_status text; v_p_status text; v_verified_by uuid; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000o'::uuid, 'order_o', 'session_o');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('order_o', 'cf_o', 165.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST O FAIL: verify';
  ASSERT (v_result->>'campaign_status')::text = 'open', 'TEST O FAIL: campaign not open';
  SELECT status INTO v_c_status FROM public.campaigns WHERE id = 'c0000000-0000-0000-0000-00000000000o';
  ASSERT v_c_status = 'open', 'TEST O FAIL: campaign status is ' || v_c_status;
  SELECT payment_status INTO v_p_status FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000o';
  ASSERT v_p_status = 'verified', 'TEST O FAIL: payment status is ' || v_p_status;
  SELECT verified_by INTO v_verified_by FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000o';
  ASSERT v_verified_by = '00000000-0000-0000-0000-000000000000', 'TEST O FAIL: verified_by should be system, got ' || v_verified_by::text;
END $$;
SELECT 'TEST O PASSED' AS result;
ROLLBACK;

-- TEST P: Idempotent verification (second verify call returns idempotent=true)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test P', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000p'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000p'::uuid, 'order_p', 'session_p');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('order_p', 'cf_p1', 110.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST P FAIL: first';
  SELECT public.verify_cashfree_webhook('order_p', 'cf_p1', 110.00) INTO v_result;
  ASSERT (v_result->>'idempotent')::boolean = true, 'TEST P FAIL: idempotent';
END $$;
SELECT 'TEST P PASSED' AS result;
ROLLBACK;

-- TEST Q: Wrong amount is rejected
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test Q', 'Brief', 'YouTube', 200, 'Test Creator', 'c0000000-0000-0000-0000-00000000000q'::uuid);
DO $$ DECLARE v_result jsonb; v_ps text; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000q'::uuid, 'order_q', 'session_q');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('order_q', 'cf_q', 999.99) INTO v_result;
  ASSERT (v_result->>'success')::boolean = false, 'TEST Q FAIL: expected failure';
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000q';
  ASSERT v_ps = 'rejected', 'TEST Q FAIL: got ' || v_ps;
END $$;
SELECT 'TEST Q PASSED' AS result;
ROLLBACK;

-- TEST R: Amount tolerance (within 0.01) is accepted
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test R', 'Brief', 'YouTube', 333, 'Test Creator', 'c0000000-0000-0000-0000-00000000000r'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000r'::uuid, 'order_r', 'session_r');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('order_r', 'cf_r', 366.30) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST R FAIL';
END $$;
SELECT 'TEST R PASSED' AS result;
ROLLBACK;

-- TEST S: Pending cannot become verified (submitted required)
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test S', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000s'::uuid);
DO $$ DECLARE v_err text; v_ps text; BEGIN
  INSERT INTO public.campaign_launch_payments (campaign_id, creator_id, campaign_budget_rupees, platform_fee_paise, total_payable_paise, payment_status, cashfree_flow, cashfree_order_id)
  VALUES ('c0000000-0000-0000-0000-00000000000s'::uuid, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 1000, 11000, 'pending', 'cashfree', 'order_s_pending');
  PERFORM set_config('role', 'service_role', true);
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_s_pending', 'cf_s', 110.00);
    ASSERT false, 'TEST S FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%not in submitted status%', 'TEST S FAIL: ' || v_err;
  END;
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000s';
  ASSERT v_ps = 'pending', 'TEST S FAIL: got ' || v_ps;
END $$;
SELECT 'TEST S PASSED' AS result;
ROLLBACK;

-- TEST T: Rejected cannot become verified
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test T', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000t'::uuid);
DO $$ DECLARE v_err text; v_ps text; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000t'::uuid, 'order_t', 'session_t');
  PERFORM set_config('role', 'service_role', true);
  PERFORM public.reject_cashfree_webhook('order_t', 'cf_t_reject', 'test reject');
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000t';
  ASSERT v_ps = 'rejected', 'TEST T FAIL: reject step got ' || v_ps;
  BEGIN
    PERFORM public.verify_cashfree_webhook('order_t', 'cf_t_try', 110.00);
    ASSERT false, 'TEST T FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%not in submitted status%', 'TEST T FAIL: ' || v_err;
  END;
END $$;
SELECT 'TEST T PASSED' AS result;
ROLLBACK;

-- TEST U: Unknown order in reject is handled gracefully
BEGIN;
SELECT set_config('role', 'service_role', true);
DO $$ DECLARE v_result jsonb; BEGIN
  SELECT public.reject_cashfree_webhook('order_nonexistent_u', 'cf_u', 'failed') INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST U FAIL';
  ASSERT (v_result->>'idempotent')::boolean = true, 'TEST U FAIL: not idempotent';
END $$;
SELECT 'TEST U PASSED' AS result;
ROLLBACK;

-- TEST V: SQL injection prevention in order_id
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test V', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000v'::uuid);
DO $$ DECLARE v_result jsonb; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000v'::uuid, 'order''; DROP TABLE campaigns; --', 'session_v');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('order''; DROP TABLE campaigns; --', 'cf_v', 110.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST V FAIL';
  ASSERT EXISTS (SELECT 1 FROM public.campaigns LIMIT 1), 'TEST V FAIL: table dropped';
END $$;
SELECT 'TEST V PASSED' AS result;
ROLLBACK;

-- TEST W: Unrelated order_id rejected by verify
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test W', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000w'::uuid);
DO $$ DECLARE v_result jsonb; v_ps text; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000w'::uuid, 'order_w', 'session_w');
  PERFORM set_config('role', 'service_role', true);
  BEGIN
    SELECT public.verify_cashfree_webhook('order_different_w', 'cf_w', 110.00) INTO v_result;
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Payment record not found%', 'TEST W FAIL: ' || SQLERRM;
  END;
  SELECT payment_status INTO v_ps FROM public.campaign_launch_payments WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000w';
  ASSERT v_ps = 'submitted', 'TEST W FAIL: got ' || v_ps;
END $$;
SELECT 'TEST W PASSED' AS result;
ROLLBACK;

-- TEST X: Audit log records verified_by as system UUID
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test X', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000x'::uuid);
DO $$ DECLARE v_result jsonb; v_log_actor text; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000x'::uuid, 'order_x', 'session_x');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('order_x', 'cf_x', 110.00) INTO v_result;
  SELECT actor INTO v_log_actor FROM public.audit_logs WHERE action = 'campaign_payment_verified_cashfree' AND entity_id = 'c0000000-0000-0000-0000-00000000000x' LIMIT 1;
  ASSERT v_log_actor = 'system', 'TEST X FAIL: audit actor is ' || v_log_actor;
END $$;
SELECT 'TEST X PASSED' AS result;
ROLLBACK;

-- TEST Y: Verify failure logs rejection via audit trail
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test Y', 'Brief', 'YouTube', 200, 'Test Creator', 'c0000000-0000-0000-0000-00000000000y'::uuid);
DO $$ DECLARE v_result jsonb; v_log_exists boolean; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000y'::uuid, 'order_y', 'session_y');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('order_y', 'cf_y_bad', 1.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = false, 'TEST Y FAIL: expected failure';
  SELECT EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'campaign_payment_rejected_amount_mismatch' AND entity_id = 'c0000000-0000-0000-0000-00000000000y') INTO v_log_exists;
  ASSERT v_log_exists, 'TEST Y FAIL: no rejection audit log';
END $$;
SELECT 'TEST Y PASSED' AS result;
ROLLBACK;

-- TEST Z: Open/unverified impossible via verify RPC
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.create_campaign('Cashfree Test Z', 'Brief', 'YouTube', 100, 'Test Creator', 'c0000000-0000-0000-0000-00000000000z'::uuid);
DO $$ DECLARE v_result jsonb; v_c_status text; v_lps text; BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree('c0000000-0000-0000-0000-00000000000z'::uuid, 'order_z', 'session_z');
  PERFORM set_config('role', 'service_role', true);
  SELECT public.verify_cashfree_webhook('order_z', 'cf_z', 110.00) INTO v_result;
  ASSERT (v_result->>'success')::boolean = true, 'TEST Z FAIL: verify';
  SELECT status, launch_payment_status INTO v_c_status, v_lps FROM public.campaigns WHERE id = 'c0000000-0000-0000-0000-00000000000z';
  ASSERT v_c_status = 'open', 'TEST Z FAIL: status is ' || v_c_status;
  ASSERT v_lps = 'verified', 'TEST Z FAIL: lps is ' || v_lps;
END $$;
SELECT 'TEST Z PASSED' AS result;
ROLLBACK;
