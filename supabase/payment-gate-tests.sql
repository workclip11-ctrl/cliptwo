-- ===========================================================================
-- CAMPAIGN PAYMENT GATE REGRESSION TESTS
-- ===========================================================================
-- Every transition TO status='open' must require launch_payment_status='verified'.
--
-- IMPORTANT: Run tests ONE AT A TIME (select a single test block, then Run).
--
-- Test UUIDs (must exist in auth.users + profiles):
--   Creator: e92427b0-254e-44cc-b2df-be83792c8a94
--   Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--
-- Each test uses a deterministic UUID for its campaign.
-- ===========================================================================

-- ===========================================================================
-- TEST A: Unpaid draft -> publish MUST FAIL
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test A'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-00000000000a'::uuid
);

DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    PERFORM public.campaign_action('b0000000-0000-0000-0000-00000000000a'::uuid, 'publish');
    ASSERT false, 'TEST A FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%launch payment has not been verified%', 'TEST A FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST A PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST B: Paid draft -> publish MUST SUCCEED
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test B'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-00000000000b'::uuid
);

DO $$
DECLARE
  v_id uuid := 'b0000000-0000-0000-0000-00000000000b'::uuid;
  v_status text;
BEGIN
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-B');
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(
    (SELECT id FROM public.campaign_launch_payments WHERE campaign_id = v_id)
  );
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT status INTO v_status FROM public.campaigns WHERE id = v_id;
  ASSERT v_status = 'open', 'TEST B FAIL: expected open, got ' || v_status;
END $$;

SELECT 'TEST B PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST C: Unpaid paused -> resume MUST FAIL
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test C'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-00000000000c'::uuid
);

DO $$
DECLARE
  v_id uuid := 'b0000000-0000-0000-0000-00000000000c'::uuid;
  v_err text;
BEGIN
  -- Create draft, submit payment (stays pending), manually set to paused
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-C');
  -- Trigger blocks status='open' but NOT status='paused' — safe to set directly
  UPDATE public.campaigns SET status = 'paused' WHERE id = v_id;

  BEGIN
    PERFORM public.campaign_action(v_id, 'resume');
    ASSERT false, 'TEST C FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%launch payment has not been verified%', 'TEST C FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST C PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST D: Paid paused -> resume MUST SUCCEED
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test D'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-00000000000d'::uuid
);

DO $$
DECLARE
  v_id uuid := 'b0000000-0000-0000-0000-00000000000d'::uuid;
  v_status text;
BEGIN
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-D');
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(
    (SELECT id FROM public.campaign_launch_payments WHERE campaign_id = v_id)
  );
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.campaign_action(v_id, 'pause');
  PERFORM public.campaign_action(v_id, 'resume');

  SELECT status INTO v_status FROM public.campaigns WHERE id = v_id;
  ASSERT v_status = 'open', 'TEST D FAIL: expected open, got ' || v_status;
END $$;

SELECT 'TEST D PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST E: Unpaid closed -> reopen MUST FAIL
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test E'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-00000000000e'::uuid
);

DO $$
DECLARE
  v_id uuid := 'b0000000-0000-0000-0000-00000000000e'::uuid;
  v_err text;
BEGIN
  -- Create draft, submit payment (stays pending), manually set to closed
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-E');
  UPDATE public.campaigns SET status = 'closed' WHERE id = v_id;

  BEGIN
    PERFORM public.campaign_action(v_id, 'reopen');
    ASSERT false, 'TEST E FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%launch payment has not been verified%', 'TEST E FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST E PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST F: Paid closed -> reopen MUST SUCCEED
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test F'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-00000000000f'::uuid
);

DO $$
DECLARE
  v_id uuid := 'b0000000-0000-0000-0000-00000000000f'::uuid;
  v_status text;
BEGIN
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-F');
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(
    (SELECT id FROM public.campaign_launch_payments WHERE campaign_id = v_id)
  );
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.campaign_action(v_id, 'close');
  PERFORM public.campaign_action(v_id, 'reopen');

  SELECT status INTO v_status FROM public.campaigns WHERE id = v_id;
  ASSERT v_status = 'open', 'TEST F FAIL: expected open, got ' || v_status;
END $$;

SELECT 'TEST F PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST G: Direct UPDATE to open with pending payment MUST FAIL (trigger)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test G'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-000000000010'::uuid
);

DO $$
DECLARE
  v_id uuid := 'b0000000-0000-0000-0000-000000000010'::uuid;
  v_err text;
BEGIN
  BEGIN
    UPDATE public.campaigns SET status = 'open' WHERE id = v_id;
    ASSERT false, 'TEST G FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%launch payment has not been verified%' OR v_err LIKE '%cannot be set to open%',
      'TEST G FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST G PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST H: Direct UPDATE to open with submitted payment MUST FAIL (trigger)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test H'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-000000000011'::uuid
);

DO $$
DECLARE
  v_id uuid := 'b0000000-0000-0000-0000-000000000011'::uuid;
  v_err text;
BEGIN
  -- Set payment to submitted
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-H');

  BEGIN
    UPDATE public.campaigns SET status = 'open' WHERE id = v_id;
    ASSERT false, 'TEST H FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%launch payment has not been verified%' OR v_err LIKE '%cannot be set to open%',
      'TEST H FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST H PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST I: Direct UPDATE to open with rejected payment MUST FAIL (trigger)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test I'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-000000000012'::uuid
);

DO $$
DECLARE
  v_id uuid := 'b0000000-0000-0000-0000-000000000012'::uuid;
  v_err text;
BEGIN
  -- Set payment to submitted then rejected (admin action)
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-I');
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.reject_campaign_launch_payment(
    (SELECT id FROM public.campaign_launch_payments WHERE campaign_id = v_id),
    'Test rejection'
  );
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    UPDATE public.campaigns SET status = 'open' WHERE id = v_id;
    ASSERT false, 'TEST I FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%launch payment has not been verified%' OR v_err LIKE '%cannot be set to open%',
      'TEST I FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST I PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST J: Admin payment verification -> open MUST SUCCEED
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test J'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-000000000013'::uuid
);

DO $$
DECLARE
  v_id uuid := 'b0000000-0000-0000-0000-000000000013'::uuid;
  v_status text;
  v_payment text;
BEGIN
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-J');
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(
    (SELECT id FROM public.campaign_launch_payments WHERE campaign_id = v_id)
  );

  SELECT status, launch_payment_status INTO v_status, v_payment FROM public.campaigns WHERE id = v_id;
  ASSERT v_status = 'open', 'TEST J FAIL: expected open, got ' || v_status;
  ASSERT v_payment = 'verified', 'TEST J FAIL: expected verified, got ' || v_payment;
END $$;

SELECT 'TEST J PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST K: Creator cannot manually set payment status to verified
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test K'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-000000000014'::uuid
);

DO $$
DECLARE
  v_id uuid := 'b0000000-0000-0000-0000-000000000014'::uuid;
  v_err text;
BEGIN
  BEGIN
    UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;
    ASSERT false, 'TEST K FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Only admin can verify%' OR v_err LIKE '%cannot be set to open%',
      'TEST K FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST K PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST L: Ownership and active-creator checks still work
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'PayGate Test L'::text, 'Brief'::text, 'YouTube'::text, 50::numeric,
  'Test Creator'::text, 'b0000000-0000-0000-0000-000000000015'::uuid
);

DO $$
DECLARE
  v_id uuid := 'b0000000-0000-0000-0000-000000000015'::uuid;
  v_err text;
BEGIN
  -- Wrong owner cannot publish
  PERFORM set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.campaign_action(v_id, 'publish');
    ASSERT false, 'TEST L FAIL: wrong owner should be rejected';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Only the campaign owner%', 'TEST L FAIL: unexpected error: ' || v_err;
  END;

  -- Unauthenticated cannot publish
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('role', 'anon', true);

  BEGIN
    PERFORM public.campaign_action(v_id, 'publish');
    ASSERT false, 'TEST L FAIL: unauthenticated should be rejected';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Not authenticated%', 'TEST L FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST L PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
