-- ===========================================================================
-- CAMPAIGN LAUNCH PAYMENTS TESTS — Phase 2
-- ===========================================================================
-- Run in Supabase SQL Editor to verify payment workflow security.
--
-- Prerequisites:
--   1. Run campaign-launch-payments.sql FIRST
--   2. Ensure these users exist with correct roles:
--      - Creator A: e92427b0-254e-44cc-b2df-be83792c8a94 (role='creator', status='active')
--      - Creator B: fe542ad2-8b40-40ea-8aba-ad8dc63140ce (role='creator', status='active')
--      - Admin:     f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd (role='admin')
--
-- IMPORTANT: Creator B MUST have role='creator' (not 'clipper') for tests 1, 13.
-- Each test is wrapped in BEGIN/ROLLBACK so no data persists.
-- ===========================================================================

-- UUIDs:
-- Creator A: e92427b0-254e-44cc-b2df-be83792c8a94
-- Creator B: fe542ad2-8b40-40ea-8aba-ad8dc63140ce
-- Admin:     f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd

-- ===========================================================================
-- TEST 1: Creator A submits payment for Creator B's campaign → DENIED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  -- Creator B creates a campaign
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Creator B Campaign', 'Brief', 'YouTube', 100, 'Creator B',
    'fe542ad2-8b40-40ea-8aba-ad8dc63140ce'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Switch to Creator A
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-FAKE-001');
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Campaign not found or access denied%',
      'Wrong error: ' || SQLERRM;
  END;

  -- Cleanup
  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 1 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 2: Creator verifies own payment → DENIED (not admin)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Creator A Campaign', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-REAL-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  BEGIN
    PERFORM public.verify_campaign_launch_payment(v_payment_id);
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Admin access required%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 3: Creator changes payment status directly → DENIED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Creator A Direct Update', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-DIRECT-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  BEGIN
    UPDATE public.campaign_launch_payments
    SET payment_status = 'verified'
    WHERE id = v_payment_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    -- REVOKE on table prevents direct UPDATE
    ASSERT SQLERRM LIKE '%permission denied%' OR SQLERRM LIKE '%denied%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 3 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 4: Non-admin verifies payment → DENIED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Non-Admin Verify Test', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-NONADMIN-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  BEGIN
    PERFORM public.verify_campaign_launch_payment(v_payment_id);
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Admin access required%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 4 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 5: Admin verifies payment → SUCCEEDS, campaign opens
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Admin Verify Success', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-ADMIN-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  ASSERT (SELECT payment_status FROM public.campaign_launch_payments WHERE id = v_payment_id) = 'verified',
    'Payment should be verified';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Campaign should be open';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_campaign_id) = 'verified',
    'Campaign launch_payment_status should be verified';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 5 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 6: Rejected payment → campaign remains draft
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Reject Stays Draft', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-REJECT-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Invalid UTR');

  ASSERT (SELECT payment_status FROM public.campaign_launch_payments WHERE id = v_payment_id) = 'rejected',
    'Payment should be rejected';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'draft',
    'Campaign should remain draft';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_campaign_id) = 'rejected',
    'Campaign launch_payment_status should be rejected';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 6 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 7: Verified payment → campaign opens
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Verified Opens Campaign', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'draft',
    'Campaign should start as draft';

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-OPEN-001');

  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_campaign_id) = 'submitted',
    'Campaign should be submitted after payment';

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Campaign should be open after verification';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_campaign_id) = 'verified',
    'Campaign launch_payment_status should be verified';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 7 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 8: Client-supplied fee is ignored — server calculates from budget
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment record;
  v_expected_fee integer;
  v_expected_total integer;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Fee Server Calculated', 'Brief', 'YouTube', 200, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    200, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-FEE-001');

  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  v_expected_fee := (200 * 100 * 0.10)::integer;
  v_expected_total := (200 * 100) + v_expected_fee;

  ASSERT v_payment.platform_fee_paise = v_expected_fee,
    format('Expected fee %s, got %s', v_expected_fee, v_payment.platform_fee_paise);
  ASSERT v_payment.total_payable_paise = v_expected_total,
    format('Expected total %s, got %s', v_expected_total, v_payment.total_payable_paise);
  ASSERT v_payment.campaign_budget_rupees = 200,
    format('Expected budget 200, got %s', v_payment.campaign_budget_rupees);

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 8 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 9: Duplicate submission → resubmission after reject
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
  v_payment_count integer;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Resubmit After Reject', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-RETRY-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Admin rejects
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Wrong UTR');

  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Resubmit with new UTR
  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-RETRY-002');

  SELECT count(*) INTO v_payment_count
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  ASSERT v_payment_count = 1,
    format('Expected 1 payment record, got %s', v_payment_count);
  ASSERT (SELECT payment_status FROM public.campaign_launch_payments WHERE id = v_payment_id) = 'submitted',
    'Payment should be resubmitted to submitted status';
  ASSERT (SELECT utr_reference FROM public.campaign_launch_payments WHERE id = v_payment_id) = 'UTR-RETRY-002',
    'UTR should be updated to new value';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 9 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 10: Cannot submit payment for closed campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Closed Campaign Payment', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  UPDATE public.campaigns SET status = 'closed' WHERE id = v_campaign_id;

  BEGIN
    PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-CLOSED-001');
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot submit payment%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 10 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 13: IDOR — Creator A cannot view Creator B's payment via RPC
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Creator B Private', 'Brief', 'YouTube', 50, 'Creator B',
    'fe542ad2-8b40-40ea-8aba-ad8dc63140ce'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-IDOR-001');

  -- Switch to Creator A
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  v_result := public.get_campaign_launch_payment(v_campaign_id);

  ASSERT (v_result->>'exists') IS NULL OR (v_result->>'exists')::text = 'false',
    'Creator A should not see Creator B payment';

  -- Cleanup
  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 13 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 14: Admin can list all payments
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
  v_result jsonb[];
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Admin List Test', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-LIST-001');

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT array_agg(result) INTO v_result
  FROM public.get_all_campaign_launch_payments(NULL) AS result;

  ASSERT v_result IS NOT NULL AND array_length(v_result, 1) > 0,
    'Admin should see payment records';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 14 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 15: Admin cannot verify an already-verified payment
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Double Verify Test', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-DOUBLE-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- First verification succeeds
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Second verification fails
  BEGIN
    PERFORM public.verify_campaign_launch_payment(v_payment_id);
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Payment is not in submitted status%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 15 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
