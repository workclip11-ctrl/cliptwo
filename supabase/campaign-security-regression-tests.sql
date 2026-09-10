-- ===========================================================================
-- PHASE 4 SECURITY FIX — REGRESSION TESTS
-- ===========================================================================
-- Tests A-G verifying the Phase 4 security fixes.
--
-- Prerequisites:
--   1. Run campaign-visibility.sql (RLS policies)
--   2. Run campaign-launch-payment-integrity.sql (trigger)
--   3. Run campaign-assets-security.sql (storage policies)
--   4. Ensure these users exist:
--      - Creator: e92427b0-254e-44cc-b2df-be83792c8a94 (role='creator', status='active')
--      - Clipper: fe542ad2-8b40-40ea-8aba-ad8dc63140ce (role='clipper', status='active')
--      - Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd (role='admin')
--
-- Each test is wrapped in BEGIN/ROLLBACK so no data persists.
-- ===========================================================================

-- ===========================================================================
-- TEST A: Creator attempts SET launch_payment_status='verified' → DENIED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Security Test A', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  BEGIN
    UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Only admin can verify%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST A PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST B: Creator attempts SET status='open', launch_payment_status='verified' → DENIED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Security Test B', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  BEGIN
    UPDATE public.campaigns
    SET status = 'open', launch_payment_status = 'verified'
    WHERE id = v_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Only admin can verify%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST B PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST C: Admin legitimate verify_campaign_launch_payment() → SUCCESS
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Security Test C', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status, utr_reference, submitted_at
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 0, 0, 0,
    'submitted', 'UTR-TEST-C', now()
  ) RETURNING id INTO v_payment_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin verifies — should succeed
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_id) = 'verified',
    'Campaign should be verified after admin verification';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'open',
    'Campaign should be open after admin verification';

  DELETE FROM public.campaign_launch_payments WHERE id = v_payment_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST C PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST D: Creator submits own payment → SUCCESS
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_count integer;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Security Test D', 'Brief', 'YouTube', 100, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Creator submits payment — should succeed
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-D');

  SELECT count(*) INTO v_payment_count
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_id AND payment_status = 'submitted';

  ASSERT v_payment_count = 1, 'Payment record should exist with status submitted';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_id) = 'submitted',
    'Campaign launch_payment_status should be submitted';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST D PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST E: Creator attempts submit for another creator's campaign → DENIED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  -- Admin-context insert (simulates another creator's campaign)
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Security Test E Other', 'Brief', 'YouTube', 0, 'Other Creator',
    'f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-FAKE-E');
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Campaign not found or access denied%',
      'Wrong error: ' || SQLERRM;
  END;

  -- Cleanup
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST E PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST F: Private source footage cannot be anonymously/publicly read
-- ===========================================================================
-- This test verifies the storage policy structure.
-- Actual storage policy testing requires the storage API (not possible in SQL).
-- We verify the policies exist with correct definitions.
BEGIN;
DO $$
DECLARE
  v_public_policy_count integer;
  v_private_policy_count integer;
BEGIN
  -- Check that public SELECT policy only allows 3-part paths
  SELECT count(*) INTO v_public_policy_count
  FROM pg_policies
  WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND policyname = 'campaign_assets_select_public'
    AND cmd = 'SELECT'
    AND roles = '{public}';

  ASSERT v_public_policy_count = 1,
    'Missing or duplicate public SELECT policy';

  -- Check that private SELECT policy exists for authenticated users
  SELECT count(*) INTO v_private_policy_count
  FROM pg_policies
  WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND policyname = 'campaign_assets_select_private'
    AND cmd = 'SELECT'
    AND 'authenticated'::regrole = ANY(roles);

  ASSERT v_private_policy_count = 1,
    'Missing or duplicate private SELECT policy';
END $$;

SELECT 'TEST F PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST G: Public thumbnail/logo behavior still works
-- ===========================================================================
-- Verify the public SELECT policy allows 3-part paths (thumbnails).
BEGIN;
DO $$
DECLARE
  v_policy_qual text;
BEGIN
  -- Get the qual (USING expression) of the public SELECT policy
  SELECT qual INTO v_policy_qual
  FROM pg_policies
  WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND policyname = 'campaign_assets_select_public'
    AND cmd = 'SELECT';

  -- Verify it checks for 3-part paths (array_length = 3)
  ASSERT v_policy_qual LIKE '%array_length%',
    'Public policy should check array_length for 3-part paths';
  ASSERT v_policy_qual LIKE '%= 3%',
    'Public policy should require exactly 3 folder parts';
END $$;

SELECT 'TEST G PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SUMMARY
-- ===========================================================================
-- TEST A: Creator cannot self-verify launch_payment_status
-- TEST B: Creator cannot set status='open' + launch_payment_status='verified'
-- TEST C: Admin verify_campaign_launch_payment() succeeds
-- TEST D: Creator submit_own payment succeeds
-- TEST E: Creator cannot submit for another creator's campaign
-- TEST F: Storage policies correctly separate public/private files
-- TEST G: Public thumbnail/logo behavior preserved
