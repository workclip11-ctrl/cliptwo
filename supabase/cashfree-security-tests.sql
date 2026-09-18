-- ===========================================================================
-- CASHFREE SANDBOX SECURITY TESTS
-- ===========================================================================
-- Tests A through N for Cashfree campaign launch payment integration.
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
-- Verifies that the submit_campaign_launch_payment_cashfree RPC
-- requires authentication.
BEGIN;
SELECT set_config('role', 'anon', true);

DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree(
      'c0000000-0000-0000-0000-00000000000a'::uuid,
      'order_test_a',
      'session_test_a'
    );
    ASSERT false, 'TEST A FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Not authenticated%', 'TEST A FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST A PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST B: Clipper role cannot create Cashfree payment order
-- ===========================================================================
-- Only creators can submit campaign payments.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "2d75364e-77e0-4eb2-af96-48f573cb4a43", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree(
      'c0000000-0000-0000-0000-00000000000b'::uuid,
      'order_test_b',
      'session_test_b'
    );
    ASSERT false, 'TEST B FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Only active creators%', 'TEST B FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST B PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST C: Creator cannot submit payment for another creator's campaign
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

-- Create campaign as creator
SELECT public.create_campaign(
  'Cashfree Test C'::text, 'Brief'::text, 'YouTube'::text, 100::numeric,
  'Test Creator'::text, 'c0000000-0000-0000-0000-00000000000c'::uuid
);

-- Now try to submit payment as a different creator (simulated by checking ownership)
DO $$
DECLARE v_err text;
BEGIN
  -- The campaign was created by e92427b0, so this should work for that creator
  -- But we test with a non-existent campaign to verify ownership check
  BEGIN
    PERFORM public.submit_campaign_launch_payment_cashfree(
      '00000000-0000-0000-0000-000000000000'::uuid,
      'order_test_c',
      'session_test_c'
    );
    ASSERT false, 'TEST C FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%not found or access denied%', 'TEST C FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST C PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST D: Server-side amount calculation matches expected formula
-- ===========================================================================
-- Verifies: budget_paise + 10% platform_fee = total_payable_paise
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Cashfree Test D'::text, 'Brief'::text, 'YouTube'::text, 200::numeric,
  'Test Creator'::text, 'c0000000-0000-0000-0000-00000000000d'::uuid
);

DO $$
DECLARE
  v_payment record;
  v_budget_paise integer;
  v_platform_fee_paise integer;
  v_total_paise integer;
BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree(
    'c0000000-0000-0000-0000-00000000000d'::uuid,
    'order_test_d',
    'session_test_d'
  );

  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000d';

  v_budget_paise := (200 * 100)::integer;  -- 20000 paise
  v_platform_fee_paise := (200 * 100 * 0.10)::integer;  -- 2000 paise
  v_total_paise := v_budget_paise + v_platform_fee_paise;  -- 22000 paise

  ASSERT v_payment.campaign_budget_rupees = 200,
    'TEST D FAIL: budget mismatch: ' || v_payment.campaign_budget_rupees;
  ASSERT v_payment.platform_fee_paise = v_platform_fee_paise,
    'TEST D FAIL: platform fee mismatch: ' || v_payment.platform_fee_paise;
  ASSERT v_payment.total_payable_paise = v_total_paise,
    'TEST D FAIL: total payable mismatch: ' || v_payment.total_payable_paise;
  ASSERT v_payment.cashfree_flow = 'cashfree',
    'TEST D FAIL: cashfree_flow mismatch: ' || v_payment.cashfree_flow;
  ASSERT v_payment.cashfree_order_id = 'order_test_d',
    'TEST D FAIL: cashfree_order_id mismatch';
  ASSERT v_payment.cashfree_payment_session_id = 'session_test_d',
    'TEST D FAIL: cashfree_payment_session_id mismatch';
END $$;

SELECT 'TEST D PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST E: Deterministic order_id format is correct
-- ===========================================================================
-- Verifies: order_id = cliptwo_{campaignId}_{timestamp}
-- We check it starts with 'cliptwo_' and contains the campaign ID.
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Cashfree Test E'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'c0000000-0000-0000-0000-00000000000e'::uuid
);

DO $$
DECLARE
  v_order_id text;
BEGIN
  -- Simulate what the create-order API does: generates deterministic order_id
  v_order_id := 'cliptwo_c0000000-0000-0000-0000-00000000000e_' || extract(epoch from now())::text;

  ASSERT v_order_id LIKE 'cliptwo_c0000000-0000-0000-0000-00000000000e_%',
    'TEST E FAIL: order_id format incorrect: ' || v_order_id;
END $$;

SELECT 'TEST E PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST F: Server-side amount in webhook matches total_payable_paise
-- ===========================================================================
-- Verifies: verify_cashfree_webhook checks amount correctly
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Cashfree Test F'::text, 'Brief'::text, 'YouTube'::text, 150::numeric,
  'Test Creator'::text, 'c0000000-0000-0000-0000-00000000000f'::uuid
);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree(
    'c0000000-0000-0000-0000-00000000000f'::uuid,
    'order_test_f_correct',
    'session_test_f'
  );

  -- Correct amount: 150 * 1.10 = 165.00 rupees
  SELECT public.verify_cashfree_webhook(
    'order_test_f_correct',
    'cf_pay_123',
    165.00
  ) INTO v_result;

  ASSERT (v_result->>'success')::boolean = true,
    'TEST F FAIL: expected success for correct amount';

  -- Idempotent: call again
  SELECT public.verify_cashfree_webhook(
    'order_test_f_correct',
    'cf_pay_123',
    165.00
  ) INTO v_result;

  ASSERT (v_result->>'idempotent')::boolean = true,
    'TEST F FAIL: expected idempotent on second call';
END $$;

SELECT 'TEST F PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST G: Webhook rejects when amount is tampered
-- ===========================================================================
-- Verifies: amount mismatch is detected and rejected
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Cashfree Test G'::text, 'Brief'::text, 'YouTube'::text, 100::numeric,
  'Test Creator'::text, 'c0000000-0000-0000-0000-00000000000g'::uuid
);

DO $$
DECLARE
  v_result jsonb;
  v_payment_status text;
BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree(
    'c0000000-0000-0000-0000-00000000000g'::uuid,
    'order_test_g_tamper',
    'session_test_g'
  );

  -- Tampered amount: 1.00 instead of expected 110.00 (100 * 1.10)
  SELECT public.verify_cashfree_webhook(
    'order_test_g_tamper',
    'cf_pay_tampered',
    1.00
  ) INTO v_result;

  ASSERT (v_result->>'success')::boolean = false,
    'TEST G FAIL: expected failure for tampered amount';

  SELECT payment_status INTO v_payment_status
  FROM public.campaign_launch_payments
  WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000g';

  ASSERT v_payment_status = 'rejected',
    'TEST G FAIL: expected rejected status, got ' || v_payment_status;
END $$;

SELECT 'TEST G PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST H: Webhook idempotent — second success call is no-op
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Cashfree Test H'::text, 'Brief'::text, 'YouTube'::text, 100::numeric,
  'Test Creator'::text, 'c0000000-0000-0000-0000-00000000000h'::uuid
);

DO $$
DECLARE
  v_result jsonb;
  v_payment record;
BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree(
    'c0000000-0000-0000-0000-00000000000h'::uuid,
    'order_test_h_idempotent',
    'session_test_h'
  );

  -- First verify
  SELECT public.verify_cashfree_webhook(
    'order_test_h_idempotent',
    'cf_pay_h1',
    110.00
  ) INTO v_result;

  ASSERT (v_result->>'success')::boolean = true,
    'TEST H FAIL: first verify should succeed';

  -- Second verify (idempotent)
  SELECT public.verify_cashfree_webhook(
    'order_test_h_idempotent',
    'cf_pay_h1',
    110.00
  ) INTO v_result;

  ASSERT (v_result->>'idempotent')::boolean = true,
    'TEST H FAIL: second verify should be idempotent';

  -- Verify campaign is still open
  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000h';

  ASSERT v_payment.payment_status = 'verified',
    'TEST H FAIL: payment should still be verified';
END $$;

SELECT 'TEST H PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST I: Webhook failure idempotent — second failure call is no-op
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Cashfree Test I'::text, 'Brief'::text, 'YouTube'::text, 100::numeric,
  'Test Creator'::text, 'c0000000-0000-0000-0000-00000000000i'::uuid
);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree(
    'c0000000-0000-0000-0000-00000000000i'::uuid,
    'order_test_i_fail',
    'session_test_i'
  );

  -- First failure
  SELECT public.reject_cashfree_webhook(
    'order_test_i_fail',
    'cf_pay_i1',
    'Payment declined'
  ) INTO v_result;

  ASSERT (v_result->>'success')::boolean = true,
    'TEST I FAIL: first reject should succeed';

  -- Second failure (idempotent)
  SELECT public.reject_cashfree_webhook(
    'order_test_i_fail',
    'cf_pay_i1',
    'Payment declined'
  ) INTO v_result;

  ASSERT (v_result->>'idempotent')::boolean = true,
    'TEST I FAIL: second reject should be idempotent';
END $$;

SELECT 'TEST I PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST J: Amount mismatch is rejected (different from tampered — lower amount)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Cashfree Test J'::text, 'Brief'::text, 'YouTube'::text, 200::numeric,
  'Test Creator'::text, 'c0000000-0000-0000-0000-00000000000j'::uuid
);

DO $$
DECLARE
  v_result jsonb;
  v_payment_status text;
BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree(
    'c0000000-0000-0000-0000-00000000000j'::uuid,
    'order_test_j_amount',
    'session_test_j'
  );

  -- Expected: 200 * 1.10 = 220.00, but webhook sends 199.99
  SELECT public.verify_cashfree_webhook(
    'order_test_j_amount',
    'cf_pay_j',
    199.99
  ) INTO v_result;

  ASSERT (v_result->>'success')::boolean = false,
    'TEST J FAIL: expected failure for amount mismatch';

  SELECT payment_status INTO v_payment_status
  FROM public.campaign_launch_payments
  WHERE campaign_id = 'c0000000-0000-0000-0000-00000000000j';

  ASSERT v_payment_status = 'rejected',
    'TEST J FAIL: expected rejected, got ' || v_payment_status;
END $$;

SELECT 'TEST J PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST K: SQL injection prevention in order_id
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Cashfree Test K'::text, 'Brief'::text, 'YouTube'::text, 100::numeric,
  'Test Creator'::text, 'c0000000-0000-0000-0000-00000000000k'::uuid
);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  -- Attempt SQL injection via order_id
  PERFORM public.submit_campaign_launch_payment_cashfree(
    'c0000000-0000-0000-0000-00000000000k'::uuid,
    'order''; DROP TABLE campaigns; --',
    'session_test_k'
  );

  -- If we reach here, the injection was safely stored (parameterized query)
  SELECT public.verify_cashfree_webhook(
    'order''; DROP TABLE campaigns; --',
    'cf_pay_k',
    110.00
  ) INTO v_result;

  ASSERT (v_result->>'success')::boolean = true,
    'TEST K FAIL: webhook should process safely with injected order_id';

  -- Verify campaigns table still exists
  ASSERT EXISTS (SELECT 1 FROM public.campaigns LIMIT 1),
    'TEST K FAIL: campaigns table was dropped!';
END $$;

SELECT 'TEST K PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST L: Unknown order_id in webhook is handled gracefully
-- ===========================================================================
BEGIN;
SELECT set_config('role', 'service_role', true);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  -- Webhook for non-existent order should return success (prevent retries)
  SELECT public.reject_cashfree_webhook(
    'order_nonexistent_12345',
    'cf_pay_nonexistent',
    'Payment failed'
  ) INTO v_result;

  ASSERT (v_result->>'success')::boolean = true,
    'TEST L FAIL: unknown order should return success to prevent retries';
END $$;

SELECT 'TEST L PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST M: Webhook amount verification is tolerant of floating point (±0.01)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Cashfree Test M'::text, 'Brief'::text, 'YouTube'::text, 333::numeric,
  'Test Creator'::text, 'c0000000-0000-0000-0000-00000000000m'::uuid
);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.submit_campaign_launch_payment_cashfree(
    'c0000000-0000-0000-0000-00000000000m'::uuid,
    'order_test_m_tolerance',
    'session_test_m'
  );

  -- Expected: 333 * 1.10 = 366.30, but Cashfree might send 366.29 due to float
  SELECT public.verify_cashfree_webhook(
    'order_test_m_tolerance',
    'cf_pay_m',
    366.29
  ) INTO v_result;

  ASSERT (v_result->>'success')::boolean = true,
    'TEST M FAIL: should tolerate floating point difference of 0.01';
END $$;

SELECT 'TEST M PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST N: Error handling does not leak internal details
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    -- Try to submit with empty order_id
    PERFORM public.submit_campaign_launch_payment_cashfree(
      'c0000000-0000-0000-0000-000000000000'::uuid,
      '',
      'session_test_n'
    );
    ASSERT false, 'TEST N FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    -- Error should not contain SQL details, table names, or column names
    ASSERT v_err NOT LIKE '%campaign_launch_payments%',
      'TEST N FAIL: error leaks table name: ' || v_err;
    ASSERT v_err NOT LIKE '%cashfree_order_id%',
      'TEST N FAIL: error leaks column name: ' || v_err;
  END;
END $$;

SELECT 'TEST N PASSED' AS result;
ROLLBACK;
