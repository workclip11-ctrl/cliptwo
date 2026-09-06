-- =========================================================================
-- CLEANUP: Remove Test Payout Sandbox database objects
--
-- This migration drops all payout_test_* objects that were created by
-- supabase/payout-test-sandbox.sql. It ONLY targets sandbox objects.
--
-- SAFE: Does NOT touch production tables, functions, or RLS policies.
-- Uses DO blocks so every statement is no-op when the object doesn't exist.
-- =========================================================================

-- Drop tables first (policies die with the table)
DROP TABLE IF EXISTS public.payout_test_requests;
DROP TABLE IF EXISTS public.payout_test_balances;

-- Drop functions (all 7)
DROP FUNCTION IF EXISTS public.payout_test_seed_balance(integer);
DROP FUNCTION IF EXISTS public.payout_test_get_balance();
DROP FUNCTION IF EXISTS public.payout_test_create_request(integer, text);
DROP FUNCTION IF EXISTS public.payout_test_process_request(uuid);
DROP FUNCTION IF EXISTS public.payout_test_complete_request(uuid, text);
DROP FUNCTION IF EXISTS public.payout_test_get_requests(text, integer, integer);
DROP FUNCTION IF EXISTS public.payout_test_reset();

-- Verify: these queries should return 0 rows after running this migration
-- SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'payout_test_%';
-- SELECT count(*) FROM information_schema.routines WHERE routine_name LIKE 'payout_test_%';
