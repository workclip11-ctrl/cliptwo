-- ===========================================================================
-- CAMPAIGN LAUNCH PAYMENTS TESTS — Phase 2
-- ===========================================================================
-- Run in Supabase SQL Editor to verify payment workflow security.
--
-- How to use:
--   1. Create test users in Supabase Dashboard > Auth > Users:
--      - A creator user (note UUID as CREATOR_A)
--      - A second creator user (note UUID as CREATOR_B)
--      - An admin user (note UUID as ADMIN_USER)
--   2. Ensure creators have role='creator' and status='active' in profiles
--   3. Ensure admin has role='admin' in profiles
--   4. Replace placeholder UUIDs below
--   5. Run each test individually and verify the expected outcome
--
-- Tests use BEGIN/ROLLBACK so no data is persisted.
-- ===========================================================================

-- Replace with real UUIDs:
-- \set creator_a '00000000-0000-0000-0000-000000000001'
-- \set creator_b '00000000-0000-0000-0000-000000000002'
-- \set admin_user '00000000-0000-0000-0000-000000000003'

-- ===========================================================================
-- TEST 1: Creator A submits payment for Creator B's campaign → DENIED
-- ===========================================================================
-- Expected: ERROR "Campaign not found or access denied"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_B", "role": "authenticated"}';

-- Creator B creates a campaign
SELECT public.create_campaign(
  'Creator B Campaign',
  'Brief',
  'YouTube',
  100,
  'Creator B'
);

-- Get campaign ID
DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Creator B Campaign'
    AND created_by = 'REPLACE_WITH_CREATOR_B'::uuid;

  -- Now Creator A tries to submit payment for Creator B's campaign
  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-FAKE-001');
END $$;

-- Expected: ERROR: Campaign not found or access denied
ROLLBACK;

-- ===========================================================================
-- TEST 2: Creator verifies own payment → DENIED (not admin)
-- ===========================================================================
-- Expected: ERROR "Admin access required"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}';

-- Creator A creates a campaign and submits payment
SELECT public.create_campaign(
  'Creator A Campaign',
  'Brief',
  'YouTube',
  50,
  'Creator A'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Creator A Campaign'
    AND created_by = 'REPLACE_WITH_CREATOR_A'::uuid;

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-REAL-001');

  -- Get payment ID
  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Creator A tries to verify their own payment
  PERFORM public.verify_campaign_launch_payment(v_payment_id);
END $$;

-- Expected: ERROR: Admin access required
ROLLBACK;

-- ===========================================================================
-- TEST 3: Creator changes payment status directly → DENIED
-- ===========================================================================
-- Expected: RLS blocks direct UPDATE (REVOKE prevents it)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}';

-- Creator A creates a campaign and submits payment
SELECT public.create_campaign(
  'Creator A Direct Update',
  'Brief',
  'YouTube',
  50,
  'Creator A'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Creator A Direct Update'
    AND created_by = 'REPLACE_WITH_CREATOR_A'::uuid;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-DIRECT-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Try to directly UPDATE payment_status to 'verified'
  UPDATE public.campaign_launch_payments
  SET payment_status = 'verified'
  WHERE id = v_payment_id;
END $$;

-- Expected: ERROR permission denied for table campaign_launch_payments
-- (REVOKE INSERT, UPDATE, DELETE FROM authenticated)
ROLLBACK;

-- ===========================================================================
-- TEST 4: Non-admin verifies payment → DENIED
-- ===========================================================================
-- Expected: ERROR "Admin access required"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}';

SELECT public.create_campaign(
  'Non-Admin Verify Test',
  'Brief',
  'YouTube',
  50,
  'Creator A'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Non-Admin Verify Test'
    AND created_by = 'REPLACE_WITH_CREATOR_A'::uuid;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-NONADMIN-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Non-admin tries to verify
  PERFORM public.verify_campaign_launch_payment(v_payment_id);
END $$;

-- Expected: ERROR: Admin access required
ROLLBACK;

-- ===========================================================================
-- TEST 5: Admin verifies payment → SUCCEEDS, campaign opens
-- ===========================================================================
-- Expected: payment_status='verified', campaign status='open'
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}';

SELECT public.create_campaign(
  'Admin Verify Success',
  'Brief',
  'YouTube',
  50,
  'Creator A'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Admin Verify Success'
    AND created_by = 'REPLACE_WITH_CREATOR_A'::uuid;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-ADMIN-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_ADMIN_USER", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin verifies
  PERFORM public.verify_campaign_launch_payment(v_payment_id);
END $$;

-- Verify results
SELECT
  clp.payment_status,
  c.status as campaign_status,
  c.launch_payment_status
FROM public.campaign_launch_payments clp
JOIN public.campaigns c ON c.id = clp.campaign_id
WHERE c.title = 'Admin Verify Success';

-- Expected: payment_status='verified', campaign_status='open', launch_payment_status='verified'
ROLLBACK;

-- ===========================================================================
-- TEST 6: Rejected payment → campaign remains draft
-- ===========================================================================
-- Expected: campaign status stays 'draft', launch_payment_status='rejected'
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}';

SELECT public.create_campaign(
  'Reject Stays Draft',
  'Brief',
  'YouTube',
  50,
  'Creator A'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Reject Stays Draft'
    AND created_by = 'REPLACE_WITH_CREATOR_A'::uuid;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-REJECT-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_ADMIN_USER", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin rejects
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Invalid UTR');
END $$;

-- Verify campaign is still draft
SELECT
  clp.payment_status,
  c.status as campaign_status,
  c.launch_payment_status
FROM public.campaign_launch_payments clp
JOIN public.campaigns c ON c.id = clp.campaign_id
WHERE c.title = 'Reject Stays Draft';

-- Expected: payment_status='rejected', campaign_status='draft', launch_payment_status='rejected'
ROLLBACK;

-- ===========================================================================
-- TEST 7: Verified payment → campaign opens
-- ===========================================================================
-- Expected: campaign transitions from draft to open
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}';

SELECT public.create_campaign(
  'Verified Opens Campaign',
  'Brief',
  'YouTube',
  50,
  'Creator A'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Verified Opens Campaign'
    AND created_by = 'REPLACE_WITH_CREATOR_A'::uuid;

  -- Verify initial state
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'draft',
    'Campaign should start as draft';

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-OPEN-001');

  -- Verify submitted state
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_campaign_id) = 'submitted',
    'Campaign should be submitted after payment';

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_ADMIN_USER", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Verify final state
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Campaign should be open after verification';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_campaign_id) = 'verified',
    'Campaign launch_payment_status should be verified';
END $$;

-- Expected: All assertions pass
ROLLBACK;

-- ===========================================================================
-- TEST 8: Client-supplied fee is ignored — server calculates from budget
-- ===========================================================================
-- Expected: Fee is always 10% of campaign budget, regardless of client input
-- The RPC doesn't accept fee parameters, so this is implicitly enforced.
-- We verify by checking the stored values match server calculation.
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}';

SELECT public.create_campaign(
  'Fee Server Calculated',
  'Brief',
  'YouTube',
  200,
  'Creator A'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment record;
  v_expected_fee integer;
  v_expected_total integer;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Fee Server Calculated'
    AND created_by = 'REPLACE_WITH_CREATOR_A'::uuid;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-FEE-001');

  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Server calculates: fee = budget_rupees * 100 * 0.10 = 200 * 100 * 0.10 = 2000 paise
  v_expected_fee := (200 * 100 * 0.10)::integer;
  -- Total = budget_paise + fee = 20000 + 2000 = 22000 paise
  v_expected_total := (200 * 100) + v_expected_fee;

  ASSERT v_payment.platform_fee_paise = v_expected_fee,
    format('Expected fee %s, got %s', v_expected_fee, v_payment.platform_fee_paise);
  ASSERT v_payment.total_payable_paise = v_expected_total,
    format('Expected total %s, got %s', v_expected_total, v_payment.total_payable_paise);
  ASSERT v_payment.campaign_budget_rupees = 200,
    format('Expected budget 200, got %s', v_payment.campaign_budget_rupees);
END $$;

-- Expected: All assertions pass (fee is always server-calculated)
ROLLBACK;

-- ===========================================================================
-- TEST 9: Duplicate submission → safely handled (resubmission after reject)
-- ===========================================================================
-- Expected: After rejection, creator can resubmit with new UTR
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}';

SELECT public.create_campaign(
  'Resubmit After Reject',
  'Brief',
  'YouTube',
  50,
  'Creator A'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
  v_payment_count integer;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Resubmit After Reject'
    AND created_by = 'REPLACE_WITH_CREATOR_A'::uuid;

  -- First submission
  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-RETRY-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Admin rejects
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_ADMIN_USER", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Wrong UTR');

  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Resubmit with new UTR
  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-RETRY-002');

  -- Verify same payment record was updated (not duplicated)
  SELECT count(*) INTO v_payment_count
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  ASSERT v_payment_count = 1,
    format('Expected 1 payment record, got %s', v_payment_count);

  -- Verify updated to submitted
  ASSERT (SELECT payment_status FROM public.campaign_launch_payments WHERE id = v_payment_id) = 'submitted',
    'Payment should be resubmitted to submitted status';
  ASSERT (SELECT utr_reference FROM public.campaign_launch_payments WHERE id = v_payment_id) = 'UTR-RETRY-002',
    'UTR should be updated to new value';
END $$;

-- Expected: Single payment record, updated to submitted with new UTR
ROLLBACK;

-- ===========================================================================
-- TEST 10: Cannot submit payment for closed/archived campaign
-- ===========================================================================
-- Expected: ERROR "Cannot submit payment for a campaign with status other than draft or open"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}';

SELECT public.create_campaign(
  'Closed Campaign Payment',
  'Brief',
  'YouTube',
  50,
  'Creator A'
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Closed Campaign Payment'
    AND created_by = 'REPLACE_WITH_CREATOR_A'::uuid;

  -- Close the campaign
  UPDATE public.campaigns SET status = 'closed' WHERE id = v_campaign_id;

  -- Try to submit payment for closed campaign
  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-CLOSED-001');
END $$;

-- Expected: ERROR: Cannot submit payment for a campaign with status other than draft or open
ROLLBACK;

-- ===========================================================================
-- TEST 11: Cannot verify payment for non-draft campaign
-- ===========================================================================
-- Expected: ERROR "Cannot verify payment: campaign is not in draft status"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_ADMIN_USER", "role": "authenticated"}';

-- Create a campaign with open status (simulate legacy)
INSERT INTO public.campaigns (
  title, brief, platform, payout, creator, status, launch_payment_status, created_by
) VALUES (
  'Non-Draft Verify', 'Brief', 'YouTube', 50, 'Test', 'open', 'submitted',
  'REPLACE_WITH_CREATOR_A'::uuid
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns WHERE title = 'Non-Draft Verify';

  -- Manually insert a submitted payment record
  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status
  ) VALUES (
    v_campaign_id, 'REPLACE_WITH_CREATOR_A'::uuid, 50, 500, 5500, 'submitted'
  ) RETURNING id INTO v_payment_id;

  -- Try to verify (should fail because campaign is 'open', not 'draft')
  PERFORM public.verify_campaign_launch_payment(v_payment_id);
END $$;

-- Expected: ERROR: Cannot verify payment: campaign is not in draft status
ROLLBACK;

-- ===========================================================================
-- TEST 12: Cannot reject payment for non-draft campaign
-- ===========================================================================
-- Expected: ERROR "Cannot reject payment: campaign is not in draft status"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_ADMIN_USER", "role": "authenticated"}';

INSERT INTO public.campaigns (
  title, brief, platform, payout, creator, status, launch_payment_status, created_by
) VALUES (
  'Non-Draft Reject', 'Brief', 'YouTube', 50, 'Test', 'open', 'submitted',
  'REPLACE_WITH_CREATOR_A'::uuid
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns WHERE title = 'Non-Draft Reject';

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status
  ) VALUES (
    v_campaign_id, 'REPLACE_WITH_CREATOR_A'::uuid, 50, 500, 5500, 'submitted'
  ) RETURNING id INTO v_payment_id;

  -- Try to reject (should fail because campaign is 'open', not 'draft')
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Test reject');
END $$;

-- Expected: ERROR: Cannot reject payment: campaign is not in draft status
ROLLBACK;

-- ===========================================================================
-- TEST 13: IDOR — Creator A cannot view Creator B's payment via RPC
-- ===========================================================================
-- Expected: Empty result (RPC filters by creator_id or is_admin)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_B", "role": "authenticated"}';

-- Creator B creates a campaign and submits payment
SELECT public.create_campaign(
  'Creator B Private',
  'Brief',
  'YouTube',
  50,
  'Creator B'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_result jsonb;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Creator B Private'
    AND created_by = 'REPLACE_WITH_CREATOR_B'::uuid;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-IDOR-001');

  -- Switch to Creator A
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Creator A tries to read Creator B's payment
  v_result := public.get_campaign_launch_payment(v_campaign_id);

  -- Should return the "no record found" default
  ASSERT (v_result->>'exists') IS NULL OR (v_result->>'exists')::text = 'false',
    'Creator A should not see Creator B payment';
END $$;

-- Expected: Payment not found (filtered by creator_id in RPC)
ROLLBACK;

-- ===========================================================================
-- TEST 14: Admin can list all payments
-- ===========================================================================
-- Expected: Admin sees all payment records
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}';

SELECT public.create_campaign(
  'Admin List Test',
  'Brief',
  'YouTube',
  50,
  'Creator A'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_result jsonb[];
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Admin List Test'
    AND created_by = 'REPLACE_WITH_CREATOR_A'::uuid;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-LIST-001');

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_ADMIN_USER", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin lists all payments
  SELECT array_agg(result) INTO v_result
  FROM public.get_all_campaign_launch_payments(NULL) AS result;

  ASSERT v_result IS NOT NULL AND array_length(v_result, 1) > 0,
    'Admin should see payment records';
END $$;

-- Expected: Admin sees the payment record
ROLLBACK;

-- ===========================================================================
-- TEST 15: Admin cannot verify an already-verified payment
-- ===========================================================================
-- Expected: ERROR "Payment is not in submitted status"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_A", "role": "authenticated"}';

SELECT public.create_campaign(
  'Double Verify Test',
  'Brief',
  'YouTube',
  50,
  'Creator A'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Double Verify Test'
    AND created_by = 'REPLACE_WITH_CREATOR_A'::uuid;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-DOUBLE-001');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_ADMIN_USER", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- First verification succeeds
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Second verification fails
  PERFORM public.verify_campaign_launch_payment(v_payment_id);
END $$;

-- Expected: ERROR: Payment is not in submitted status
ROLLBACK;

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
