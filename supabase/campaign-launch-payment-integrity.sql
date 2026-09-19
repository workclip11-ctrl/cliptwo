-- ============================================================================
-- Campaign Launch Payment Integrity (Phase 4 Security Fix)
-- ============================================================================
-- Blocks creator from self-verifying launch_payment_status.
--
-- Invariant: launch_payment_status = 'verified' can ONLY be set by:
--   1. Admin (via verify_campaign_launch_payment RPC) — detected by is_admin()
--   2. Cashfree webhook (via verify_cashfree_webhook RPC) — detected by the
--      temporary table _cf_verify_signal, created by the SECURITY DEFINER
--      function in the same transaction.
--
-- WHY TEMPORARY TABLE INSTEAD OF CLIENT-SETTABLE GUC:
--   A client-controllable GUC (set via set_config()) must NOT be the security
--   boundary. Any authenticated user can call set_config('app.x', 'true', true)
--   to forge the marker. The previous approach used this and was rejected.
--
--   The temporary table approach is secure because:
--   1. verify_cashfree_webhook is SECURITY DEFINER callable only by service_role.
--      Only service_role can reach the code path that creates _cf_verify_signal.
--   2. PostgREST connection pool connections do NOT have CREATE privilege on the
--      pg_temp schema. An authenticated/anon/creator caller cannot CREATE TEMP
--      TABLE even if they know the name.
--   3. Temp tables are session-scoped. Each PostgREST request gets its own
--      session. A temp table created in one request is not visible in another.
--   4. The trigger fires in the SAME transaction as the function, so it can
--      see the temp table. No cross-request leakage.
--   5. Even if an attacker could somehow create a temp table with this name,
--      they would also need to bypass the function's REVOKE (service_role only)
--      AND pass the payment status/amount validation inside the function.
--      The trigger alone is not the only security layer.
--
-- Also protects:
--   'submitted' → only campaign owner or admin
--   'rejected'  → only admin
--   'pending'   → never via UPDATE (only on INSERT via create_campaign)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_campaign_launch_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only care when launch_payment_status actually changes
  IF NEW.launch_payment_status IS DISTINCT FROM OLD.launch_payment_status THEN

    -- 'verified' can be set by admin (via verify_campaign_launch_payment RPC)
    -- OR by Cashfree webhook (via verify_cashfree_webhook RPC).
    -- Cashfree path: the SECURITY DEFINER function creates temp table
    -- _cf_verify_signal in the same transaction. We check for its existence.
    IF NEW.launch_payment_status = 'verified' AND NOT public.is_admin() THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = '_cf_verify_signal'
          AND n.nspname LIKE 'pg_temp%'
      ) THEN
        RAISE EXCEPTION 'Only admin can verify campaign launch payment';
      END IF;
    END IF;

    -- 'submitted' can be set by campaign owner (submit RPC) or admin
    IF NEW.launch_payment_status = 'submitted' THEN
      IF NEW.created_by != auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only the campaign owner can submit launch payment';
      END IF;
    END IF;

    -- 'rejected' can ONLY be set by admin (via reject_campaign_launch_payment RPC)
    IF NEW.launch_payment_status = 'rejected' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admin can reject campaign launch payment';
    END IF;

    -- 'pending' should NEVER be set via UPDATE (only on INSERT via create_campaign)
    IF NEW.launch_payment_status = 'pending' THEN
      RAISE EXCEPTION 'Cannot set launch payment status to pending via UPDATE';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_campaign_launch_payment_integrity ON public.campaigns;
CREATE TRIGGER enforce_campaign_launch_payment_integrity
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_campaign_launch_payment_integrity();
