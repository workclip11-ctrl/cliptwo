-- =========================================================================
-- CLEANUP: Remove Test Payout Sandbox database objects
--
-- This migration drops all payout_test_* objects that were created by
-- supabase/payout-test-sandbox.sql. It ONLY targets sandbox objects.
--
-- SAFE: Does NOT touch production tables, functions, or RLS policies.
-- =========================================================================

-- Drop RLS policies first
DROP POLICY IF EXISTS "payout_test_requests_admin_only" ON public.payout_test_requests;
DROP POLICY IF EXISTS "payout_test_balances_admin_only" ON public.payout_test_balances;

-- Drop functions (all 7)
DROP FUNCTION IF EXISTS public.payout_test_seed_balance(integer);
DROP FUNCTION IF EXISTS public.payout_test_get_balance();
DROP FUNCTION IF EXISTS public.payout_test_create_request(integer, text);
DROP FUNCTION IF EXISTS public.payout_test_process_request(uuid);
DROP FUNCTION IF EXISTS public.payout_test_complete_request(uuid, text);
DROP FUNCTION IF EXISTS public.payout_test_get_requests(text, integer, integer);
DROP FUNCTION IF EXISTS public.payout_test_reset();

-- Drop tables
DROP TABLE IF EXISTS public.payout_test_requests;
DROP TABLE IF EXISTS public.payout_test_balances;

-- Verify: these queries should return 0 rows after running this migration
-- SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'payout_test_%';
-- SELECT count(*) FROM information_schema.routines WHERE routine_name LIKE 'payout_test_%';
