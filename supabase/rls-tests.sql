-- ===========================================================================
-- RLS TEST SUITE — Run in Supabase SQL Editor to verify security hardening
--
-- Test UUIDs (must exist in auth.users + profiles):
--   User A (creator): e92427b0-254e-44cc-b2df-be83792c8a94
--   User B (clipper): fe542ad2-8b40-40ea-8aba-ad8dc63140ce
--
-- Tests use SET LOCAL to simulate different authenticated users.
-- Each test is wrapped in a BEGIN/ROLLBACK so no data is modified.
-- ===========================================================================

-- ===========================================================================
-- TEST A: User A tries to read User B's financial_records
-- Expected: DENIED (empty result)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT count(*) AS test_a_result FROM public.financial_records
WHERE clipper_id = 'fe542ad2-8b40-40ea-8aba-ad8dc63140ce';
-- Expected: 0 rows
ROLLBACK;

-- ===========================================================================
-- TEST B: User A tries to read User B's payout_requests
-- Expected: DENIED (empty result)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT count(*) AS test_b_result FROM public.payout_requests
WHERE user_id = 'fe542ad2-8b40-40ea-8aba-ad8dc63140ce';
-- Expected: 0 rows
ROLLBACK;

-- ===========================================================================
-- TEST C: User A tries to insert a payout_requests row directly
-- Expected: DENIED (RLS blocks INSERT since policy was removed)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
INSERT INTO public.payout_requests (user_id, amount, net_amount, upi_id, finance_record_ids)
VALUES ('e92427b0-254e-44cc-b2df-be83792c8a94', 10000, 10000, 'test@upi', '{}');
-- Expected: ERROR (new row violates row-level security policy)
ROLLBACK;

-- ===========================================================================
-- TEST D: User A calls get_wallet_balance(User B)
-- Expected: Returns {"error": "Unauthorized", "available": 0}
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT public.get_wallet_balance('fe542ad2-8b40-40ea-8aba-ad8dc63140ce');
-- Expected: {"error": "Unauthorized", ...}
ROLLBACK;

-- ===========================================================================
-- TEST E: User A calls get_clipper_earnings(User B)
-- Expected: Returns {"error": "Unauthorized", ...}
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT public.get_clipper_earnings('fe542ad2-8b40-40ea-8aba-ad8dc63140ce');
-- Expected: {"error": "Unauthorized", ...}
ROLLBACK;

-- ===========================================================================
-- TEST F: User A tries to update another user's social_accounts
-- Expected: DENIED (RLS blocks UPDATE)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
UPDATE public.social_accounts SET handle = 'hacked' WHERE user_id = 'fe542ad2-8b40-40ea-8aba-ad8dc63140ce';
-- Expected: 0 rows updated (RLS blocks cross-user update)
ROLLBACK;

-- ===========================================================================
-- TEST G: User A tries to set social_accounts.verified = true
-- Expected: DENIED (trigger blocks non-admin verified changes)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
UPDATE public.social_accounts SET verified = true WHERE user_id = 'e92427b0-254e-44cc-b2df-be83792c8a94';
-- Expected: ERROR (trigger: Only admins can change verified status)
ROLLBACK;

-- ===========================================================================
-- TEST H: User A inserts an audit_logs row pretending to be admin
-- Expected: DENIED (RLS blocks non-admin INSERT)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
INSERT INTO public.audit_logs (id, actor, action, entity_type, entity_id)
VALUES ('fake-audit', 'admin@fake.com', 'clip_approved', 'clip', 'fake-id');
-- Expected: ERROR (new row violates row-level security policy)
ROLLBACK;

-- ===========================================================================
-- TEST I: Anonymous user attempts to call request_payout()
-- Expected: DENIED (function requires authenticated role)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT public.request_payout();
-- Expected: ERROR (permission denied for function request_payout)
ROLLBACK;

-- ===========================================================================
-- TEST J: User A attempts to call admin_clip_action
-- Expected: DENIED (function checks is_admin() internally)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT public.admin_clip_action('00000000-0000-0000-0000-000000000000'::uuid, 'reject');
-- Expected: ERROR (Only admins can perform clip actions)
ROLLBACK;

-- ===========================================================================
-- TEST K: User A attempts to call admin_user_action
-- Expected: DENIED (function checks is_admin() internally)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT public.admin_user_action('fe542ad2-8b40-40ea-8aba-ad8dc63140ce', 'suspend');
-- Expected: ERROR (Only admins can perform user actions)
ROLLBACK;

-- ===========================================================================
-- TEST L: User A tries to insert a notification for User B
-- Expected: DENIED (admin-only INSERT policy)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
INSERT INTO public.notifications (user_id, title, message, type)
VALUES ('fe542ad2-8b40-40ea-8aba-ad8dc63140ce', 'Fake notification', 'Hacked', 'system');
-- Expected: ERROR (new row violates row-level security policy)
ROLLBACK;

-- ===========================================================================
-- TEST M: User A tries to insert a social_accounts row
-- Expected: DENIED (INSERT policy was removed)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
INSERT INTO public.social_accounts (user_id, platform, handle, status)
VALUES ('e92427b0-254e-44cc-b2df-be83792c8a94', 'YouTube', '@test', 'not_connected');
-- Expected: ERROR (new row violates row-level security policy)
ROLLBACK;

-- ===========================================================================
-- TEST N: User A tries to insert a social_connections row
-- Expected: DENIED (INSERT policy was removed)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
INSERT INTO public.social_connections (social_account_id, user_id, platform)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'e92427b0-254e-44cc-b2df-be83792c8a94', 'YouTube');
-- Expected: ERROR (new row violates row-level security policy)
ROLLBACK;

-- ===========================================================================
-- TEST O: User A tries to insert a social_oauth_states row
-- Expected: DENIED (INSERT policy was removed)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
INSERT INTO public.social_oauth_states (user_id, platform, state, expires_at)
VALUES ('e92427b0-254e-44cc-b2df-be83792c8a94', 'YouTube', 'fake-state', now() + interval '10 minutes');
-- Expected: ERROR (new row violates row-level security policy)
ROLLBACK;

-- ===========================================================================
-- TEST P: Storage tests must be done via the Supabase JS client or API.
-- Direct SQL testing of storage.objects is limited.
-- ===========================================================================

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
