-- ===========================================================================
-- CAMPAIGN STATE MACHINE TESTS — Phase 1
-- ===========================================================================
-- Run in Supabase SQL Editor to verify campaign creation hardening.
--
-- Test UUIDs (must exist in auth.users + profiles):
--   Creator: e92427b0-254e-44cc-b2df-be83792c8a94
--   Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--
-- Tests use BEGIN/ROLLBACK so no data is persisted.
-- ===========================================================================

-- ===========================================================================
-- TEST 1: Creator creates a campaign -> initial state is draft + pending
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 1',
  'Test brief for phase 1',
  'YouTube',
  50,
  'Test Creator'
);

DO $$
DECLARE
  v_status text;
  v_payment text;
BEGIN
  SELECT status, launch_payment_status INTO v_status, v_payment
  FROM public.campaigns
  WHERE title = 'Test Campaign 1'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  ASSERT v_status = 'draft', 'TEST 1 FAIL: expected status=draft, got ' || v_status;
  ASSERT v_payment = 'pending', 'TEST 1 FAIL: expected launch_payment_status=pending, got ' || v_payment;
END $$;

SELECT 'TEST 1 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 2: Creator attempts direct INSERT with status='open' -> gets 'draft'
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

INSERT INTO public.campaigns (
  title, brief, platform, payout, creator, status, launch_payment_status
) VALUES (
  'Test Campaign 2 - Direct INSERT',
  'Trying to bypass RPC',
  'YouTube',
  50,
  'Test Creator',
  'open',
  'verified'
);

DO $$
DECLARE
  v_status text;
  v_payment text;
BEGIN
  SELECT status, launch_payment_status INTO v_status, v_payment
  FROM public.campaigns
  WHERE title = 'Test Campaign 2 - Direct INSERT';

  ASSERT v_status = 'draft', 'TEST 2 FAIL: expected status=draft, got ' || v_status;
  ASSERT v_payment = 'pending', 'TEST 2 FAIL: expected launch_payment_status=pending, got ' || v_payment;
END $$;

SELECT 'TEST 2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 3: Creator attempts direct UPDATE to set status='open' without verified -> BLOCKED
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 3',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 3'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  BEGIN
    UPDATE public.campaigns SET status = 'open' WHERE id = v_campaign_id;
    ASSERT false, 'TEST 3 FAIL: UPDATE should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%launch payment has not been verified%',
      'TEST 3 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 3 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 4: Creator attempts direct UPDATE to set launch_payment_status='verified' -> BLOCKED
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 4',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 4'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  BEGIN
    UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_campaign_id;
    ASSERT false, 'TEST 4 FAIL: UPDATE should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Only admin can verify%',
      'TEST 4 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 4 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 5: Creator attempts campaign_action('publish') without verified payment -> BLOCKED
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 5',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 5'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  BEGIN
    PERFORM public.campaign_action(v_campaign_id, 'publish');
    ASSERT false, 'TEST 5 FAIL: campaign_action should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%launch payment has not been verified%',
      'TEST 5 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 5 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 6: Admin verifies payment -> campaign becomes open
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 6',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
  v_status text;
  v_payment text;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 6'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-TEST-6');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  SELECT status, launch_payment_status INTO v_status, v_payment
  FROM public.campaigns WHERE id = v_campaign_id;

  ASSERT v_status = 'open', 'TEST 6 FAIL: expected status=open, got ' || v_status;
  ASSERT v_payment = 'verified', 'TEST 6 FAIL: expected launch_payment_status=verified, got ' || v_payment;
END $$;

SELECT 'TEST 6 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 7: Creator attempts to resume a draft campaign -> BLOCKED
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 7',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 7'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  BEGIN
    PERFORM public.campaign_action(v_campaign_id, 'resume');
    ASSERT false, 'TEST 7 FAIL: campaign_action(resume) should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%must be paused%',
      'TEST 7 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 7 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 8: Existing campaigns are NOT affected by default change
-- ===========================================================================
BEGIN;
INSERT INTO public.campaigns (
  title, brief, platform, payout, creator, status, launch_payment_status,
  created_by
) VALUES (
  'Legacy Campaign',
  'Pre-migration campaign',
  'YouTube',
  100,
  'Legacy Creator',
  'open',
  'verified',
  'f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd'::uuid
);

DO $$
DECLARE
  v_status text;
  v_payment text;
BEGIN
  SELECT status, launch_payment_status INTO v_status, v_payment
  FROM public.campaigns WHERE title = 'Legacy Campaign';

  ASSERT v_status = 'open', 'TEST 8 FAIL: expected status=open, got ' || v_status;
  ASSERT v_payment = 'verified', 'TEST 8 FAIL: expected launch_payment_status=verified, got ' || v_payment;
END $$;

SELECT 'TEST 8 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 9: Full lifecycle: publish -> pause -> resume with verified payment
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 9',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
  v_status text;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 9'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-TEST-9');
  SELECT id INTO v_payment_id FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.campaign_action(v_campaign_id, 'publish');
  SELECT status INTO v_status FROM public.campaigns WHERE id = v_campaign_id;
  ASSERT v_status = 'open', 'TEST 9 FAIL: expected open after publish, got ' || v_status;

  PERFORM public.campaign_action(v_campaign_id, 'pause');
  SELECT status INTO v_status FROM public.campaigns WHERE id = v_campaign_id;
  ASSERT v_status = 'paused', 'TEST 9 FAIL: expected paused after pause, got ' || v_status;

  PERFORM public.campaign_action(v_campaign_id, 'resume');
  SELECT status INTO v_status FROM public.campaigns WHERE id = v_campaign_id;
  ASSERT v_status = 'open', 'TEST 9 FAIL: expected open after resume, got ' || v_status;
END $$;

SELECT 'TEST 9 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 10: Admin state transition validation -> pause draft is BLOCKED
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 10',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 10'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.admin_campaign_action(v_campaign_id, 'pause');
    ASSERT false, 'TEST 10 FAIL: admin_campaign_action(pause) on draft should fail';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%must be open%',
      'TEST 10 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 10 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 11: Non-owner cannot call campaign_action on another creator's campaign
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 11',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 11'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.campaign_action(v_campaign_id, 'pause');
    ASSERT false, 'TEST 11 FAIL: non-owner campaign_action should fail';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Only the campaign owner%',
      'TEST 11 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 11 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 12: Creator cannot UPDATE created_by on their own campaign
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 12',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 12'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  BEGIN
    UPDATE public.campaigns
    SET created_by = '11111111-1111-1111-1111-111111111111'::uuid
    WHERE id = v_campaign_id;
    ASSERT false, 'TEST 12 FAIL: UPDATE created_by should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot change campaign owner%',
      'TEST 12 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 12 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 13: Creator A cannot UPDATE Creator B's campaign (RLS blocks)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 13 - Creator B',
  'Test brief',
  'YouTube',
  50,
  'Test Creator B'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_rows integer;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 13 - Creator B'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE public.campaigns SET title = 'HACKED' WHERE id = v_campaign_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'TEST 13 FAIL: RLS should block cross-creator UPDATE, but ' || v_rows || ' rows updated';
END $$;

SELECT 'TEST 13 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 14: Creator A cannot DELETE Creator B's campaign (RLS blocks)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 14 - Creator B',
  'Test brief',
  'YouTube',
  50,
  'Test Creator B'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_rows integer;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 14 - Creator B'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  DELETE FROM public.campaigns WHERE id = v_campaign_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'TEST 14 FAIL: RLS should block cross-creator DELETE, but ' || v_rows || ' rows deleted';
END $$;

SELECT 'TEST 14 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 15: Creator cannot DELETE their own campaign (admin-only DELETE policy)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Test Campaign 15 - Own Delete',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_rows integer;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 15 - Own Delete'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  DELETE FROM public.campaigns WHERE id = v_campaign_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'TEST 15 FAIL: creator DELETE should be blocked (admin-only policy), but ' || v_rows || ' rows deleted';
END $$;

SELECT 'TEST 15 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
